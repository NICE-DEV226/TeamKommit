import { Types, type ClientSession } from 'mongoose';
import { config } from '../config.js';
import { withTransaction } from '../db.js';
import { Hackathon } from '../models/Hackathon.js';
import { Team } from '../models/Team.js';
import { Membership } from '../models/Membership.js';
import { Invitation } from '../models/Invitation.js';
import { JoinRequest } from '../models/JoinRequest.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { OutboxEvent } from '../models/OutboxEvent.js';
import { DomainRejection } from '../lib/errors.js';
import {
  claimIdempotencyKey,
  finalizeIdempotencyKey,
  type IdempotencyClaim,
} from '../lib/idempotency.js';

export type AdmissionSource = 'INVITATION' | 'JOIN_REQUEST' | 'INVITE_CODE';

export interface AdmitInput {
  hackathonId: Types.ObjectId;
  teamId: Types.ObjectId;
  participantId: Types.ObjectId;
  source: AdmissionSource;
  actorId: Types.ObjectId; // who triggered: leader accepting a request, or the participant accepting an invite
  invitationId?: Types.ObjectId;
  joinRequestId?: Types.ObjectId;
  idempotencyKey?: string;
}

export type AdmitResult =
  | { ok: true; replayed: boolean; membershipId: Types.ObjectId; teamId: Types.ObjectId; memberCount: number; teamVersion: number }
  | { ok: false; replayed: boolean; status: number; code: string; message: string };

interface TeamSnapshot {
  _id: Types.ObjectId;
  maxSize: number;
  memberCount: number;
  lifecycleStatus: string;
  recruitmentStatus: string;
  admissionsHalted?: boolean;
}

async function classifyRejection(
  session: ClientSession,
  hackathon: { formationOpensAt: Date; formationClosesAt: Date; status: string } | null,
  team: TeamSnapshot | null,
): Promise<DomainRejection> {
  const now = new Date();
  if (!hackathon) return new DomainRejection('HACKATHON_NOT_FOUND', 'Hackathon not found', 404);
  if (hackathon.status !== 'FORMATION_OPEN')
    return new DomainRejection('FORMATION_NOT_OPEN', 'Team formation is not open for this hackathon', 409);
  if (now < hackathon.formationOpensAt)
    return new DomainRejection('FORMATION_NOT_STARTED', 'Team formation has not started yet', 409);
  if (now > hackathon.formationClosesAt)
    return new DomainRejection('FORMATION_CLOSED', 'The team formation deadline has passed', 409);
  if (!team) return new DomainRejection('TEAM_NOT_FOUND', 'Team not found', 404);
  if (team.lifecycleStatus !== 'ACTIVE')
    return new DomainRejection('TEAM_DISBANDED', 'This team no longer exists', 410);
  if (team.admissionsHalted)
    return new DomainRejection('TEAM_HALTED', 'Admissions are temporarily halted for this team', 503);
  if (team.recruitmentStatus !== 'OPEN')
    return new DomainRejection('RECRUITMENT_CLOSED', `Recruitment is ${team.recruitmentStatus.toLowerCase()} for this team`, 409);
  if (team.memberCount >= team.maxSize)
    return new DomainRejection('TEAM_FULL', 'This team has no remaining seats', 409);
  return new DomainRejection('ADMISSION_REJECTED', 'Admission rejected', 409);
}

/**
 * THE admission protocol — single serialization point for all membership
 * creation (invitation accept, join-request accept, invite code).
 *
 * Race-proofing: the conditional update on the team document
 *   { memberCount < maxSize (via $expr), lifecycleStatus ACTIVE,
 *     recruitmentStatus OPEN, admissionsHalted != true }
 * is the capacity serialization point. MongoDB serializes writes to the
 * same document, so N concurrent admissions yield at most one success
 * per remaining seat. The partial unique index on Membership
 * (hackathonId, participantId WHERE status=ACTIVE) is the second guard:
 * one team per person per hackathon, enforced by the database itself.
 */
export async function admit(input: AdmitInput): Promise<AdmitResult> {
  const idempotencyPayload = { ...input, idempotencyKey: undefined };
  let claim: IdempotencyClaim | undefined;
  if (input.idempotencyKey) {
    claim = await claimIdempotencyKey('admission', input.idempotencyKey, idempotencyPayload);
    if (claim.replay) {
      const body = claim.replay.body as { ok?: boolean } & Record<string, unknown>;
      return { ...(body as object), replayed: true } as AdmitResult;
    }
    if (claim.inProgress) {
      return { ok: false, replayed: false, status: 409, code: 'REQUEST_IN_PROGRESS', message: 'An identical request is already being processed' };
    }
  }

  try {
    return await withTransaction(async (session) => {
      // 1. Context loads (snapshot reads inside the tx)
      const hackathon = await Hackathon.findById(input.hackathonId).session(session).lean();
      const team = (await Team.findById(input.teamId).session(session).lean()) as TeamSnapshot | null;

      // 2. Cheap rejections BEFORE the serialization point
      const now = new Date();
      const existing = await Membership.findOne({
        hackathonId: input.hackathonId,
        participantId: input.participantId,
        status: 'ACTIVE',
      }).session(session).lean();

      if (existing) {
        throw new DomainRejection('ALREADY_IN_TEAM', 'Participant already belongs to a team in this hackathon', 409);
      }

      // 3. THE serialization point: conditional capacity claim.
      //    $expr compares memberCount < maxSize atomically at write time.
      const claimUpdate = await Team.updateOne(
        {
          _id: input.teamId,
          hackathonId: input.hackathonId,
          lifecycleStatus: 'ACTIVE',
          recruitmentStatus: 'OPEN',
          admissionsHalted: { $ne: true },
          $expr: { $lt: ['$memberCount', '$maxSize'] },
        },
        { $inc: { memberCount: 1, version: 1 } },
        { session },
      );

      if (claimUpdate.matchedCount === 0) {
        // Re-read for a precise rejection reason (still inside tx snapshot).
        const freshTeam = (await Team.findById(input.teamId).session(session).lean()) as TeamSnapshot | null;
        const freshHack = await Hackathon.findById(input.hackathonId).session(session).lean();
        throw await classifyRejection(session, freshHack, freshTeam);
      }

      // 4. Membership insert — partial unique index is the hard guard.
      //    A concurrent admission of the SAME participant to ANOTHER team
      //    loses here with E11000 → converted to a domain rejection below.
      let membership;
      try {
        membership = await Membership.create(
        [{
          hackathonId: input.hackathonId,
          teamId: input.teamId,
          participantId: input.participantId,
          role: 'MEMBER',
          status: 'ACTIVE',
          source: input.source,
          joinedAt: now,
        }],
        { session },
        );
      } catch (err) {
        if ((err as { code?: number }).code === 11000) {
          throw new DomainRejection('ALREADY_IN_TEAM', 'Participant already belongs to a team in this hackathon', 409);
        }
        throw err;
      }

      // 5. Consume the authorization artifact (invite or join request).
      if (input.invitationId) {
        const inv = await Invitation.updateOne(
          { _id: input.invitationId, teamId: input.teamId, status: 'PENDING', expiresAt: { $gt: now } },
          { $set: { status: 'ACCEPTED', consumedAt: now, decidedAt: now } },
          { session },
        );
        if (inv.matchedCount === 0) {
          throw new DomainRejection('INVITATION_INVALID', 'Invitation is no longer valid', 410);
        }
      }
      if (input.joinRequestId) {
        const jr = await JoinRequest.updateOne(
          { _id: input.joinRequestId, teamId: input.teamId, participantId: input.participantId, status: 'PENDING' },
          { $set: { status: 'ACCEPTED', decidedBy: input.actorId, decidedAt: now } },
          { session },
        );
        if (jr.matchedCount === 0) {
          throw new DomainRejection('JOIN_REQUEST_INVALID', 'Join request is no longer pending', 409);
        }
      }

      // 6. Audit + outbox in the SAME transaction.
      const teamAfter = await Team.findById(input.teamId).session(session).lean();
      const version = teamAfter?.version ?? 0;
      await AuditEvent.create(
        [{
          hackathonId: input.hackathonId,
          teamId: input.teamId,
          actorId: input.actorId,
          subjectId: input.participantId,
          eventType: 'TEAM_MEMBER_ADMITTED',
          operationId: input.idempotencyKey,
          aggregateVersion: version,
          metadata: { source: input.source, memberCount: teamAfter?.memberCount },
          occurredAt: now,
        }],
        { session },
      );
      await OutboxEvent.create(
        [{
          aggregateType: 'team',
          aggregateId: input.teamId,
          aggregateVersion: version,
          eventType: 'team.member.joined',
          payload: {
            hackathonId: input.hackathonId.toString(),
            teamId: input.teamId.toString(),
            participantId: input.participantId.toString(),
            memberCount: teamAfter?.memberCount,
            recruitmentStatus: teamAfter?.recruitmentStatus,
          },
        }],
        { session },
      );

      const result = {
        ok: true as const,
        membershipId: membership[0]!._id as Types.ObjectId,
        teamId: input.teamId,
        memberCount: teamAfter?.memberCount ?? 0,
        teamVersion: version,
      };

      // 7. Persist the terminal result atomically with the business writes.
      if (claim) {
        await finalizeIdempotencyKey(session, claim, {
          ok: true,
          status: 200,
          body: { ...result, replayed: false },
        });
      }
      return { ...result, replayed: false };
    });
  } catch (err) {
    if (err instanceof DomainRejection && claim) {
      // Business tx aborted → persist REJECTED standalone so retries replay it.
      await finalizeIdempotencyKey(undefined, claim, {
        ok: false,
        status: err.httpStatus,
        body: { ok: false, replayed: false, status: err.httpStatus, code: err.code, message: err.message },
      });
      return { ok: false, replayed: false, status: err.httpStatus, code: err.code, message: err.message };
    }
    if (err instanceof DomainRejection) {
      return { ok: false, replayed: false, status: err.httpStatus, code: err.code, message: err.message };
    }
    throw err;
  }
}
