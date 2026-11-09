import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { setupTestDb, teardownTestDb, makeUser, makeHackathon, makeTeamWithLeader } from './helpers.js';
import { createApp } from '../api/app.js';
import { signAccessToken } from '../api/middleware/auth.js';
import { Membership } from '../models/Membership.js';
import { JoinRequest } from '../models/JoinRequest.js';
import { Invitation, generateInviteCode } from '../models/Invitation.js';
import { Team } from '../models/Team.js';

/**
 * Authorization regression tests for holes found in the security audit:
 *  1. team.leaderId is denormalized and goes STALE when a leader departs
 *     with no successor — leadership must be checked via ACTIVE membership.
 *  2. POST /submissions must bind teamId to the claimed hackathonId.
 *  3. /invitations/:id/accept must not bypass the invite-code secret.
 */
let app: ReturnType<typeof createApp>;
beforeAll(async () => { await setupTestDb(); app = createApp(); });
afterAll(teardownTestDb);

const auth = (userId: Types.ObjectId) => ({ Authorization: `Bearer ${signAccessToken(userId)}` });

/** Team with a leader + one plain member (so the leader can leave without disbanding). */
async function teamWithMember() {
  const hackathon = await makeHackathon();
  const leader = await makeUser();
  const member = await makeUser();
  const team = await makeTeamWithLeader(hackathon._id as Types.ObjectId, leader._id as Types.ObjectId, { maxSize: 4 });
  await Membership.create({
    hackathonId: hackathon._id, teamId: team._id, participantId: member._id,
    role: 'MEMBER', status: 'ACTIVE', source: 'JOIN_REQUEST',
  });
  await Team.updateOne({ _id: team._id }, { $inc: { memberCount: 1 } });
  return { hackathon, leader, member, team };
}

describe('departed leader loses team control (stale leaderId)', () => {
  it('leader who leaves with no successor cannot manage the team anymore', async () => {
    const { leader, team } = await teamWithMember();
    const tid = team._id.toString();
    const h = auth(leader._id as Types.ObjectId);

    // Sanity: leader CAN manage before leaving.
    expect((await request(app).patch(`/api/teams/${tid}`).set(h).send({ description: 'ok' })).status).toBe(200);

    // Leader leaves; no openToLead successor exists → leaderId stays stale.
    const leave = await request(app).post(`/api/teams/${tid}/leave`).set(h);
    expect(leave.status).toBe(200);
    const after = await Team.findById(team._id).lean();
    expect(after!.leaderId.toString()).toBe(leader._id.toString()); // stale pointer remains…

    // …but every leader-gated surface must now reject them.
    expect((await request(app).patch(`/api/teams/${tid}`).set(h).send({ name: 'Hijack' })).status).toBe(403);
    expect((await request(app).post(`/api/teams/${tid}/invite-code`).set(h)).status).toBe(403);
    expect((await request(app).post(`/api/teams/${tid}/remove`).set(h).send({ membershipId: 'a'.repeat(24) })).status).toBe(403);
    expect((await request(app).get(`/api/teams/${tid}/requests`).set(h)).status).toBe(403);
    expect((await request(app).get(`/api/teams/${tid}/audit`).set(h)).status).toBe(403);
    expect((await request(app).post(`/api/teams/${tid}/invitations`).set(h).send({ inviteeId: 'a'.repeat(24) })).status).not.toBe(201);

    // A pending join request must not be decidable by the departed leader.
    const requester = await makeUser();
    const jr = await JoinRequest.create({
      hackathonId: team.hackathonId, teamId: team._id, participantId: requester._id,
      status: 'PENDING', message: '',
    });
    expect((await request(app).post(`/api/requests/${jr._id}/accept`).set(h)).status).toBe(403);
    expect((await request(app).post(`/api/requests/${jr._id}/decline`).set(h)).status).toBe(403);
  });

  it('legitimate leader (active LEADER membership) keeps full access', async () => {
    const { leader, team } = await teamWithMember();
    const tid = team._id.toString();
    const h = auth(leader._id as Types.ObjectId);
    expect((await request(app).get(`/api/teams/${tid}/requests`).set(h)).status).toBe(200);
    expect((await request(app).get(`/api/teams/${tid}/audit`).set(h)).status).toBe(200);
    const inv = await request(app).post(`/api/teams/${tid}/invite-code`).set(h);
    expect(inv.status).toBe(201);
    expect(inv.body.code).toBeTruthy();
  });
});

describe('submission hackathon binding', () => {
  it('rejects a submission pairing a team with a different hackathonId', async () => {
    const { leader, team } = await teamWithMember();
    const otherHackathon = await makeHackathon();
    const res = await request(app).post('/api/submissions')
      .set(auth(leader._id as Types.ObjectId))
      .send({
        hackathonId: otherHackathon._id.toString(),
        teamId: team._id.toString(),
        title: 'cross-event submission',
      });
    expect(res.status).toBe(404);
  });
});

describe('invite-code bypass via /invitations/:id/accept', () => {
  it('CODE invitations cannot be accepted by id alone — the code is required', async () => {
    const { hackathon, team } = await teamWithMember();
    const joiner = await makeUser();
    const { raw, hash } = generateInviteCode();
    const inv = await Invitation.create({
      hackathonId: hackathon._id, teamId: team._id,
      inviterId: team.leaderId, kind: 'CODE', codeHash: hash,
      status: 'PENDING', expiresAt: new Date(Date.now() + 3600_000),
    });
    // Attacker who somehow learned the invitation _id but NOT the code:
    const res = await request(app).post(`/api/invitations/${inv._id}/accept`)
      .set(auth(joiner._id as Types.ObjectId));
    expect(res.status).toBe(404);
    // Sanity: the real code path still works.
    const ok = await request(app).post('/api/teams/join-code')
      .set(auth(joiner._id as Types.ObjectId))
      .send({ code: raw });
    expect(ok.status).toBe(200);
    expect((await Membership.findOne({ teamId: team._id, participantId: joiner._id, status: 'ACTIVE' }).lean())).toBeTruthy();
  });
});
