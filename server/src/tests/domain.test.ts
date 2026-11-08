import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Types } from 'mongoose';
import { setupTestDb, teardownTestDb, makeUser, makeHackathon, makeTeamWithLeader } from './helpers.js';
import { admit } from '../domain/admission.js';
import { createTeam, leaveTeam, createInviteCode } from '../domain/teams.js';
import { claimIdempotencyKey, finalizeIdempotencyKey } from '../lib/idempotency.js';
import { Team } from '../models/Team.js';
import { Membership } from '../models/Membership.js';
import { Invitation, hashInviteCode } from '../models/Invitation.js';
import { JoinRequest } from '../models/JoinRequest.js';
import { User } from '../models/User.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);

describe('idempotency', () => {
  it('same key + same payload replays stored result (no double join)', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser();
    const team = await makeTeamWithLeader(hackathon._id as Types.ObjectId, leader._id as Types.ObjectId);
    const user = await makeUser();
    const key = `idem-${Date.now()}`;

    const [r1, r2] = await Promise.all([
      admit({ hackathonId: hackathon._id as Types.ObjectId, teamId: team._id as Types.ObjectId, participantId: user._id as Types.ObjectId, source: 'INVITE_CODE', actorId: user._id as Types.ObjectId, idempotencyKey: key }),
      admit({ hackathonId: hackathon._id as Types.ObjectId, teamId: team._id as Types.ObjectId, participantId: user._id as Types.ObjectId, source: 'INVITE_CODE', actorId: user._id as Types.ObjectId, idempotencyKey: key }),
    ]);
    // One executed, the other replayed or got in-progress → still exactly one membership
    const oks = [r1, r2].filter((r) => r.ok);
    expect(oks.length).toBeGreaterThanOrEqual(1);
    const count = await Membership.countDocuments({ participantId: user._id, status: 'ACTIVE' });
    expect(count).toBe(1);

    // Sequential retry with same key → replay
    const r3 = await admit({ hackathonId: hackathon._id as Types.ObjectId, teamId: team._id as Types.ObjectId, participantId: user._id as Types.ObjectId, source: 'INVITE_CODE', actorId: user._id as Types.ObjectId, idempotencyKey: key });
    expect(r3.replayed).toBe(true);
    const count2 = await Membership.countDocuments({ participantId: user._id, status: 'ACTIVE' });
    expect(count2).toBe(1);
  });

  it('same key + different payload is rejected as key misuse', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser();
    const team = await makeTeamWithLeader(hackathon._id as Types.ObjectId, leader._id as Types.ObjectId);
    const user = await makeUser();
    const key = `idem-misuse-${Date.now()}`;
    const base = { hackathonId: hackathon._id as Types.ObjectId, teamId: team._id as Types.ObjectId, participantId: user._id as Types.ObjectId, source: 'INVITE_CODE' as const, actorId: user._id as Types.ObjectId, idempotencyKey: key };
    await admit(base);
    const other = await makeUser();
    await expect(
      admit({ ...base, participantId: other._id as Types.ObjectId }),
    ).rejects.toThrow(/different request/);
  });

  it('terminal rejection is persisted and replayed', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser();
    const team = await makeTeamWithLeader(hackathon._id as Types.ObjectId, leader._id as Types.ObjectId, { maxSize: 2 });
    const u1 = await makeUser();
    const u2 = await makeUser();
    const key = `idem-rej-${Date.now()}`;
    const fill = await admit({ hackathonId: hackathon._id as Types.ObjectId, teamId: team._id as Types.ObjectId, participantId: u1._id as Types.ObjectId, source: 'INVITE_CODE', actorId: u1._id as Types.ObjectId });
    expect(fill.ok).toBe(true);
    const rejInput = { hackathonId: hackathon._id as Types.ObjectId, teamId: team._id as Types.ObjectId, participantId: u2._id as Types.ObjectId, source: 'INVITE_CODE' as const, actorId: u2._id as Types.ObjectId, idempotencyKey: key };
    const r1 = await admit(rejInput);
    expect(r1.ok).toBe(false);
    const r2 = await admit(rejInput); // retry → replayed rejection
    expect(r2.ok).toBe(false);
    expect(r2.replayed).toBe(true);
    if (!r2.ok) expect(r2.code).toBe('TEAM_FULL');
  });
});

describe('team lifecycle', () => {
  it('createTeam is atomic: team + leader membership together', async () => {
    const hackathon = await makeHackathon();
    const creator = await makeUser();
    const res = await createTeam({ hackathonId: hackathon._id as Types.ObjectId, creatorId: creator._id as Types.ObjectId, name: 'Atomic Team', maxSize: 4 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const team = await Team.findById(res.teamId).lean();
      expect(team!.memberCount).toBe(1);
      const m = await Membership.findOne({ teamId: res.teamId, status: 'ACTIVE' }).lean();
      expect(m!.role).toBe('LEADER');
    }
  });

  it('creator cannot create two teams', async () => {
    const hackathon = await makeHackathon();
    const creator = await makeUser();
    await createTeam({ hackathonId: hackathon._id as Types.ObjectId, creatorId: creator._id as Types.ObjectId, name: 'First', maxSize: 4 });
    const res2 = await createTeam({ hackathonId: hackathon._id as Types.ObjectId, creatorId: creator._id as Types.ObjectId, name: 'Second', maxSize: 4 });
    expect(res2.ok).toBe(false);
    if (!res2.ok) expect(res2.code).toBe('ALREADY_IN_TEAM');
  });

  it('last member leaving disbands the team', async () => {
    const hackathon = await makeHackathon();
    const solo = await makeUser();
    const res = await createTeam({ hackathonId: hackathon._id as Types.ObjectId, creatorId: solo._id as Types.ObjectId, name: 'Solo', maxSize: 3 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const out = await leaveTeam({ hackathonId: hackathon._id as Types.ObjectId, teamId: res.teamId, participantId: solo._id as Types.ObjectId, actorId: solo._id as Types.ObjectId });
    expect(out.disbanded).toBe(true);
    const team = await Team.findById(res.teamId).lean();
    expect(team!.lifecycleStatus).toBe('DISBANDED');
    expect(team!.memberCount).toBe(0);
  });

  it('leader leaving promotes an opted-in successor', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser();
    const res = await createTeam({ hackathonId: hackathon._id as Types.ObjectId, creatorId: leader._id as Types.ObjectId, name: 'Succ', maxSize: 4 });
    if (!res.ok) throw new Error('setup failed');
    const m1 = await makeUser();
    const m2 = await makeUser();
    // admit two members, m2 opts into leadership
    await admit({ hackathonId: hackathon._id as Types.ObjectId, teamId: res.teamId, participantId: m1._id as Types.ObjectId, source: 'INVITE_CODE', actorId: m1._id as Types.ObjectId });
    await admit({ hackathonId: hackathon._id as Types.ObjectId, teamId: res.teamId, participantId: m2._id as Types.ObjectId, source: 'INVITE_CODE', actorId: m2._id as Types.ObjectId });
    await Membership.updateOne({ teamId: res.teamId, participantId: m2._id }, { $set: { openToLead: true } });

    const out = await leaveTeam({ hackathonId: hackathon._id as Types.ObjectId, teamId: res.teamId, participantId: leader._id as Types.ObjectId, actorId: leader._id as Types.ObjectId });
    expect(out.disbanded).toBe(false);
    expect(out.successorId?.toString()).toBe(m2._id.toString());
    const team = await Team.findById(res.teamId).lean();
    expect(team!.leaderId.toString()).toBe(m2._id.toString());
    const newLeader = await Membership.findOne({ teamId: res.teamId, participantId: m2._id }).lean();
    expect(newLeader!.role).toBe('LEADER');
  });

  it('leader leaving with no opted-in successor closes recruitment (no silent takeover)', async () => {
    const hackathon = await makeHackathon({ leaderSuccessionPolicy: 'OPT_IN_THEN_DISBAN' });
    const leader = await makeUser();
    const res = await createTeam({ hackathonId: hackathon._id as Types.ObjectId, creatorId: leader._id as Types.ObjectId, name: 'NoSucc', maxSize: 4 });
    if (!res.ok) throw new Error('setup failed');
    const m1 = await makeUser();
    await admit({ hackathonId: hackathon._id as Types.ObjectId, teamId: res.teamId, participantId: m1._id as Types.ObjectId, source: 'INVITE_CODE', actorId: m1._id as Types.ObjectId });
    // m1 does NOT opt in
    const out = await leaveTeam({ hackathonId: hackathon._id as Types.ObjectId, teamId: res.teamId, participantId: leader._id as Types.ObjectId, actorId: leader._id as Types.ObjectId });
    expect(out.successorId).toBeNull();
    const team = await Team.findById(res.teamId).lean();
    expect(team!.recruitmentStatus).toBe('CLOSED'); // leaderless team stops recruiting
    expect(team!.lifecycleStatus).toBe('ACTIVE');    // but isn't silently disbanded
  });
});

describe('invitations & join requests', () => {
  it('invite code flow: hash-only storage, expiry, single use', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser();
    const res = await createTeam({ hackathonId: hackathon._id as Types.ObjectId, creatorId: leader._id as Types.ObjectId, name: 'Coded', maxSize: 4 });
    if (!res.ok) throw new Error('setup failed');
    const { code } = await createInviteCode({ teamId: res.teamId, hackathonId: hackathon._id as Types.ObjectId, actorId: leader._id as Types.ObjectId });
    expect(code.length).toBeGreaterThanOrEqual(20);

    // stored hashed, never raw
    const inv = await Invitation.findOne({ teamId: res.teamId, kind: 'CODE' }).lean();
    expect(inv!.codeHash).toBe(hashInviteCode(code));
    expect(JSON.stringify(inv)).not.toContain(code);

    const joiner = await makeUser();
    const r = await admit({
      hackathonId: hackathon._id as Types.ObjectId, teamId: res.teamId,
      participantId: joiner._id as Types.ObjectId, source: 'INVITE_CODE',
      actorId: joiner._id as Types.ObjectId, invitationId: inv!._id as Types.ObjectId,
    });
    expect(r.ok).toBe(true);
    // code is single-use now
    const invAfter = await Invitation.findById(inv!._id).lean();
    expect(invAfter!.status).toBe('ACCEPTED');
  });

  it('join request → leader accept admits exactly once', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser();
    const res = await createTeam({ hackathonId: hackathon._id as Types.ObjectId, creatorId: leader._id as Types.ObjectId, name: 'ReqFlow', maxSize: 4 });
    if (!res.ok) throw new Error('setup failed');
    const applicant = await makeUser();
    const jr = await JoinRequest.create({
      hackathonId: hackathon._id, teamId: res.teamId, participantId: applicant._id,
      message: 'hi', status: 'PENDING',
    });
    const r = await admit({
      hackathonId: hackathon._id as Types.ObjectId, teamId: res.teamId,
      participantId: applicant._id as Types.ObjectId, source: 'JOIN_REQUEST',
      actorId: leader._id as Types.ObjectId, joinRequestId: jr._id as Types.ObjectId,
    });
    expect(r.ok).toBe(true);
    const jrAfter = await JoinRequest.findById(jr._id).lean();
    expect(jrAfter!.status).toBe('ACCEPTED');
    expect(jrAfter!.decidedBy!.toString()).toBe(leader._id.toString());
    // second accept attempt on same request → rejected, no double membership
    const r2 = await admit({
      hackathonId: hackathon._id as Types.ObjectId, teamId: res.teamId,
      participantId: applicant._id as Types.ObjectId, source: 'JOIN_REQUEST',
      actorId: leader._id as Types.ObjectId, joinRequestId: jr._id as Types.ObjectId,
    });
    expect(r2.ok).toBe(false);
  });
});
