import { Types, type ClientSession } from 'mongoose';
import { withTransaction } from '../db.js';
import { Hackathon } from '../models/Hackathon.js';
import { Team } from '../models/Team.js';
import { Membership } from '../models/Membership.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { OutboxEvent } from '../models/OutboxEvent.js';
import { DomainRejection } from '../lib/errors.js';
import { finalizeIdempotencyKey, type IdempotencyClaim } from '../lib/idempotency.js';
import { generateInviteCode, Invitation } from '../models/Invitation.js';
import { canonicalSkills } from './taxonomy.js';
import { config } from '../config.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export interface CreateTeamInput {
  hackathonId: Types.ObjectId;
  creatorId: Types.ObjectId;
  name: string;
  description?: string;
  minSize?: number;
  maxSize: number;
  skillsSought?: string[];
  formationMessage?: string;
  recruitmentStatus?: 'OPEN' | 'PAUSED' | 'CLOSED';
  idempotency?: IdempotencyClaim;
}

/**
 * Team creation is atomic: team + creator membership + audit + outbox
 * commit together. The unique (hackathonId, participantId) ACTIVE index
 * guarantees the creator isn't already on a team even under races.
 */
export async function createTeam(input: CreateTeamInput) {
  try {
    return await withTransaction(async (session) => {
      const hackathon = await Hackathon.findById(input.hackathonId).session(session).lean();
      const now = new Date();
      if (!hackathon) throw new DomainRejection('HACKATHON_NOT_FOUND', 'Hackathon not found', 404);
      if (hackathon.status !== 'FORMATION_OPEN')
        throw new DomainRejection('FORMATION_NOT_OPEN', 'Team formation is closed', 409);
      if (now < hackathon.formationOpensAt || now > hackathon.formationClosesAt)
        throw new DomainRejection('FORMATION_CLOSED', 'Outside the team formation window', 409);
      if (input.maxSize > hackathon.maxTeamSize || input.maxSize < hackathon.minTeamSize)
        throw new DomainRejection('INVALID_TEAM_SIZE', `Team size must be between ${hackathon.minTeamSize} and ${hackathon.maxTeamSize}`, 422);
      const minSize = input.minSize ?? hackathon.minTeamSize;
      if (minSize > input.maxSize) throw new DomainRejection('INVALID_TEAM_SIZE', 'minSize cannot exceed maxSize', 422);

      const existing = await Membership.findOne({
        hackathonId: input.hackathonId,
        participantId: input.creatorId,
        status: 'ACTIVE',
      }).session(session).lean();
      if (existing) throw new DomainRejection('ALREADY_IN_TEAM', 'You already belong to a team in this hackathon', 409);

      const baseSlug = slugify(input.name) || 'team';
      let slug = baseSlug;
      for (let i = 0; i < 5; i++) {
        const clash = await Team.findOne({ hackathonId: input.hackathonId, slug }).session(session).lean();
        if (!clash) break;
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      }

      const [team] = await Team.create(
        [{
          hackathonId: input.hackathonId,
          name: input.name.trim(),
          slug,
          description: input.description ?? '',
          leaderId: input.creatorId,
          minSize,
          maxSize: input.maxSize,
          memberCount: 1,
          recruitmentStatus: input.recruitmentStatus ?? 'OPEN',
          skillsSought: canonicalSkills(input.skillsSought ?? []),
          formationMessage: input.formationMessage ?? '',
          version: 1,
        }],
        { session },
      );

      await Membership.create(
        [{
          hackathonId: input.hackathonId,
          teamId: team!._id,
          participantId: input.creatorId,
          role: 'LEADER',
          status: 'ACTIVE',
          source: 'CREATOR',
          joinedAt: now,
          openToLead: true,
        }],
        { session },
      );

      await AuditEvent.create(
        [{
          hackathonId: input.hackathonId,
          teamId: team!._id,
          actorId: input.creatorId,
          subjectId: input.creatorId,
          eventType: 'TEAM_CREATED',
          operationId: undefined,
          aggregateVersion: 1,
          occurredAt: now,
        }],
        { session },
      );
      await OutboxEvent.create(
        [{
          aggregateType: 'team',
          aggregateId: team!._id,
          aggregateVersion: 1,
          eventType: 'team.created',
          payload: { hackathonId: input.hackathonId.toString(), teamId: team!._id.toString(), name: input.name },
        }],
        { session },
      );

      const result = { ok: true as const, teamId: team!._id, slug: team!.slug, memberCount: 1 };
      if (input.idempotency) {
        await finalizeIdempotencyKey(session, input.idempotency, { ok: true, status: 201, body: result });
      }
      return { ...result, replayed: false };
    });
  } catch (err) {
    if (err instanceof DomainRejection) {
      if (input.idempotency) {
        await finalizeIdempotencyKey(undefined, input.idempotency, {
          ok: false, status: err.httpStatus,
          body: { ok: false, status: err.httpStatus, code: err.code, message: err.message },
        });
      }
      return { ok: false as const, status: err.httpStatus, code: err.code, message: err.message };
    }
    throw err;
  }
}

/**
 * A member leaves a team. Handles, atomically in one transaction:
 * - membership → LEFT
 * - team.memberCount decrement
 * - last member leaving → team DISBANDED
 * - leader leaving → succession among openToLead members (opt-in only),
 *   else ORGANIZER_FALLBACK keeps a provisional leader flag or disbands
 *   per hackathon policy.
 */
export async function leaveTeam(input: {
  hackathonId: Types.ObjectId;
  teamId: Types.ObjectId;
  participantId: Types.ObjectId;
  actorId: Types.ObjectId;
}) {
  return withTransaction(async (session) => {
    const now = new Date();
    const membership = await Membership.findOne({
      teamId: input.teamId,
      participantId: input.participantId,
      status: 'ACTIVE',
    }).session(session);
    if (!membership) throw new DomainRejection('NOT_A_MEMBER', 'You are not an active member of this team', 409);

    const team = await Team.findById(input.teamId).session(session);
    if (!team) throw new DomainRejection('TEAM_NOT_FOUND', 'Team not found', 404);
    const hackathon = await Hackathon.findById(input.hackathonId).session(session).lean();

    const isLeader = membership.role === 'LEADER';
    const remaining = await Membership.countDocuments(
      { teamId: input.teamId, status: 'ACTIVE', _id: { $ne: membership._id } },
      { session },
    );
    const disband = remaining === 0;

    // Leader departure → pick successor BEFORE mutating, among opt-in members.
    // successor.participantId is the USER id — leaderId references User, not Membership.
    let successor: { _id: Types.ObjectId; participantId: Types.ObjectId } | null = null;
    if (isLeader && !disband) {
      successor = await Membership.findOne({
        teamId: input.teamId,
        status: 'ACTIVE',
        _id: { $ne: membership._id },
        openToLead: true,
      }).sort({ joinedAt: 1 }).select('_id participantId').session(session);

      const policy = hackathon?.leaderSuccessionPolicy ?? 'OPT_IN_THEN_DISBAN';
      if (!successor && policy === 'OPT_IN_THEN_DISBAN') {
        // No consenting successor → remaining members stay, team is
        // leaderless and recruitment closes; organizer can intervene.
        await Team.updateOne(
          { _id: team._id },
          { $set: { recruitmentStatus: 'CLOSED' }, $inc: { version: 1 } },
          { session },
        );
      }
    }

    membership.status = 'LEFT';
    membership.leftAt = now;
    membership.version += 1;
    await membership.save({ session });

    const teamUpdate: Record<string, unknown> = {
      $inc: { memberCount: -1, version: 1 },
    };
    if (disband) teamUpdate.$set = { lifecycleStatus: 'DISBANDED', recruitmentStatus: 'CLOSED' };
    else if (successor) teamUpdate.$set = { leaderId: successor.participantId };
    await Team.updateOne({ _id: team._id }, teamUpdate, { session });

    if (successor) {
      await Membership.updateOne(
        { _id: successor._id },
        { $set: { role: 'LEADER' } },
        { session },
      );
    }

    await AuditEvent.create(
      [{
        hackathonId: input.hackathonId,
        teamId: input.teamId,
        actorId: input.actorId,
        subjectId: input.participantId,
        eventType: disband ? 'TEAM_DISBANDED' : isLeader ? 'LEADERSHIP_TRANSFERRED' : 'TEAM_MEMBER_LEFT',
        aggregateVersion: team.version + 1,
        metadata: { successorId: successor?.participantId?.toString(), remaining },
        occurredAt: now,
      }],
      { session },
    );
    await OutboxEvent.create(
      [{
        aggregateType: 'team',
        aggregateId: team._id,
        aggregateVersion: team.version + 1,
        eventType: disband ? 'team.disbanded' : 'team.member.left',
        payload: {
          hackathonId: input.hackathonId.toString(),
          teamId: team._id.toString(),
          participantId: input.participantId.toString(),
          memberCount: team.memberCount - 1,
          disbanded: disband,
          newLeaderId: successor?.participantId?.toString(),
        },
      }],
      { session },
    );

    return { ok: true as const, disbanded: disband, successorId: successor?.participantId ?? null };
  });
}

/** Leader (or self) creates a shareable invite code for the team. */
export async function createInviteCode(input: {
  teamId: Types.ObjectId;
  hackathonId: Types.ObjectId;
  actorId: Types.ObjectId;
}) {
  const team = await Team.findById(input.teamId).lean();
  if (!team || team.leaderId.toString() !== input.actorId.toString()) {
    throw new DomainRejection('NOT_LEADER', 'Only the team leader can create invite codes', 403);
  }
  const { raw, hash } = generateInviteCode();
  const expiresAt = new Date(Date.now() + config.invite.ttlHours * 3600_000);
  await Invitation.create({
    hackathonId: input.hackathonId,
    teamId: input.teamId,
    inviterId: input.actorId,
    kind: 'CODE',
    codeHash: hash,
    status: 'PENDING',
    expiresAt,
  });
  // Raw code is returned ONCE and never stored.
  return { code: raw, expiresAt };
}
