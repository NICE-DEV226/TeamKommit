import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Types } from 'mongoose';
import { setupTestDb, teardownTestDb, makeUser, makeHackathon, makeTeamWithLeader } from './helpers.js';
import { admit } from '../domain/admission.js';
import { Team } from '../models/Team.js';
import { Membership } from '../models/Membership.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { JoinRequest } from '../models/JoinRequest.js';

/**
 * THE race test — the challenge's headline requirement.
 * 50 participants hit the last seat at the same instant; exactly one
 * must be admitted. Proven against a real MongoDB replica set.
 */
describe('admission race-proofing', () => {
  beforeAll(setupTestDb);
  afterAll(teardownTestDb);

  it('50 concurrent admissions for the last seat → exactly 1 success', async () => {
    const hackathon = await makeHackathon({ maxTeamSize: 6 });
    const leader = await makeUser();
    // Team with 5 members, maxSize 6 → exactly ONE seat left
    const team = await makeTeamWithLeader(hackathon._id as Types.ObjectId, leader._id as Types.ObjectId, { maxSize: 6 });
    // Fill to 5 members
    const fillers = await Promise.all(Array.from({ length: 4 }, () => makeUser()));
    await Membership.insertMany(fillers.map((u) => ({
      hackathonId: hackathon._id, teamId: team._id, participantId: u._id,
      role: 'MEMBER' as const, status: 'ACTIVE' as const, source: 'JOIN_REQUEST' as const,
    })));
    await Team.updateOne({ _id: team._id }, { $set: { memberCount: 5 } });

    // 50 racers, all distinct participants, same instant
    const racers = await Promise.all(Array.from({ length: 50 }, () => makeUser()));
    const joinRequests = await JoinRequest.insertMany(
      racers.map((u) => ({
        hackathonId: hackathon._id, teamId: team._id, participantId: u._id,
        message: 'race', status: 'PENDING' as const,
      })),
    );

    const results = await Promise.all(
      racers.map((u, i) =>
        admit({
          hackathonId: hackathon._id as Types.ObjectId,
          teamId: team._id as Types.ObjectId,
          participantId: u._id as Types.ObjectId,
          source: 'JOIN_REQUEST',
          actorId: leader._id as Types.ObjectId,
          joinRequestId: joinRequests[i]!._id as Types.ObjectId,
        }),
      ),
    );

    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(49);
    expect(failures.every((f) => !f.ok && f.code === 'TEAM_FULL')).toBe(true);

    // Invariants hold
    const fresh = await Team.findById(team._id).lean();
    expect(fresh!.memberCount).toBe(6);
    const activeCount = await Membership.countDocuments({ teamId: team._id, status: 'ACTIVE' });
    expect(activeCount).toBe(6);
    const acceptedRequests = await JoinRequest.countDocuments({ teamId: team._id, status: 'ACCEPTED' });
    expect(acceptedRequests).toBe(1);
    const audits = await AuditEvent.countDocuments({ teamId: team._id, eventType: 'TEAM_MEMBER_ADMITTED' });
    // leader creation audit is TEAM_CREATED; admissions audit = exactly 1 here
    expect(audits).toBe(1);
  });

  it('same participant cannot join two teams concurrently', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser();
    const t1 = await makeTeamWithLeader(hackathon._id as Types.ObjectId, leader._id as Types.ObjectId);
    const leader2 = await makeUser();
    const t2 = await makeTeamWithLeader(hackathon._id as Types.ObjectId, leader2._id as Types.ObjectId);
    const racer = await makeUser();

    const [r1, r2] = await Promise.all([
      admit({ hackathonId: hackathon._id as Types.ObjectId, teamId: t1._id as Types.ObjectId, participantId: racer._id as Types.ObjectId, source: 'INVITE_CODE', actorId: racer._id as Types.ObjectId }),
      admit({ hackathonId: hackathon._id as Types.ObjectId, teamId: t2._id as Types.ObjectId, participantId: racer._id as Types.ObjectId, source: 'INVITE_CODE', actorId: racer._id as Types.ObjectId }),
    ]);
    const oks = [r1, r2].filter((r) => r.ok);
    expect(oks).toHaveLength(1); // unique partial index guarantees one team per person
    const active = await Membership.countDocuments({ participantId: racer._id, hackathonId: hackathon._id, status: 'ACTIVE' });
    expect(active).toBe(1);
  });

  it('rejected admission does not consume capacity', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser();
    const team = await makeTeamWithLeader(hackathon._id as Types.ObjectId, leader._id as Types.ObjectId, { maxSize: 2 });
    // fill the only seat
    const seat = await makeUser();
    const r1 = await admit({ hackathonId: hackathon._id as Types.ObjectId, teamId: team._id as Types.ObjectId, participantId: seat._id as Types.ObjectId, source: 'INVITE_CODE', actorId: seat._id as Types.ObjectId });
    expect(r1.ok).toBe(true);
    const late = await makeUser();
    const r2 = await admit({ hackathonId: hackathon._id as Types.ObjectId, teamId: team._id as Types.ObjectId, participantId: late._id as Types.ObjectId, source: 'INVITE_CODE', actorId: late._id as Types.ObjectId });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe('TEAM_FULL');
    const fresh = await Team.findById(team._id).lean();
    expect(fresh!.memberCount).toBe(2); // never over-counted
  });
});
