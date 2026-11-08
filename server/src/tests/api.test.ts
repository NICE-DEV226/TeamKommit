import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { setupTestDb, teardownTestDb, makeUser, makeHackathon, makeTeamWithLeader } from './helpers.js';
import { createApp } from '../api/app.js';
import { signAccessToken } from '../api/middleware/auth.js';
import { Team } from '../models/Team.js';
import { Membership } from '../models/Membership.js';
import { createTeam } from '../domain/teams.js';

let app: ReturnType<typeof createApp>;
beforeAll(async () => { await setupTestDb(); app = createApp(); });
afterAll(teardownTestDb);

const auth = (userId: Types.ObjectId) => ({ Authorization: `Bearer ${signAccessToken(userId)}` });

describe('API — auth & board', () => {
  it('register → login → me roundtrip', async () => {
    const email = `api-${Date.now()}@test.dev`;
    const reg = await request(app).post('/api/auth/register').send({ email, password: 'password123', displayName: 'API User' });
    expect(reg.status).toBe(201);
    expect(reg.body.accessToken).toBeTruthy();
    const login = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
    expect(login.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set(auth(new Types.ObjectId(login.body.user._id)));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.user.passwordHash).toBeUndefined();
  });

  it('rejects bad input with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'nope', password: 'x' });
    expect(res.status).toBe(400);
  });

  it('board lists open teams with derived placesLeft', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser();
    await makeTeamWithLeader(hackathon._id as Types.ObjectId, leader._id as Types.ObjectId, { maxSize: 4 });
    const res = await request(app).get(`/api/board?hackathonId=${hackathon._id}`);
    expect(res.status).toBe(200);
    expect(res.body.teams.length).toBe(1);
    expect(res.body.teams[0].placesLeft).toBe(3);
  });

  it('unauthenticated team creation → 401', async () => {
    const hackathon = await makeHackathon();
    const res = await request(app).post('/api/teams').send({ hackathonId: hackathon._id.toString(), name: 'NoAuth', maxSize: 3 });
    expect(res.status).toBe(401);
  });

  it('team creation via API + idempotency-key header prevents duplicates', async () => {
    const hackathon = await makeHackathon();
    const user = await makeUser();
    const payload = { hackathonId: hackathon._id.toString(), name: 'Idem API', maxSize: 4 };
    const key = `api-idem-${Date.now()}`;
    const [r1, r2] = await Promise.all([
      request(app).post('/api/teams').set(auth(user._id as Types.ObjectId)).set('Idempotency-Key', key).send(payload),
      request(app).post('/api/teams').set(auth(user._id as Types.ObjectId)).set('Idempotency-Key', key).send(payload),
    ]);
    // One created (201); the concurrent twin either replayed (201) or got 409 in-progress
    expect([r1.status, r2.status].every((s) => [201, 409].includes(s))).toBe(true);
    expect([r1.status, r2.status]).toContain(201);
    // A retry after settle replays the stored result — still exactly one team
    const r3 = await request(app).post('/api/teams').set(auth(user._id as Types.ObjectId)).set('Idempotency-Key', key).send(payload);
    expect(r3.status).toBe(201);
    expect(r3.body.replayed ?? r3.body.teamId).toBeTruthy();
    const teams = await Team.countDocuments({ name: 'Idem API' });
    expect(teams).toBe(1);
    const memberships = await Membership.countDocuments({ participantId: user._id, status: 'ACTIVE' });
    expect(memberships).toBe(1);
  });
});

describe('API — membership flows', () => {
  it('non-leader cannot accept join requests (403)', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser();
    const res = await createTeam({ hackathonId: hackathon._id as Types.ObjectId, creatorId: leader._id as Types.ObjectId, name: 'Guard', maxSize: 4 });
    if (!res.ok) throw new Error('setup');
    const applicant = await makeUser();
    const { JoinRequest } = await import('../models/JoinRequest.js');
    const jr = await JoinRequest.create({ hackathonId: hackathon._id, teamId: res.teamId, participantId: applicant._id, status: 'PENDING' });
    const rando = await makeUser();
    const out = await request(app).post(`/api/requests/${jr._id}/accept`).set(auth(rando._id as Types.ObjectId));
    expect(out.status).toBe(403);
    // leader CAN
    const ok = await request(app).post(`/api/requests/${jr._id}/accept`).set(auth(leader._id as Types.ObjectId));
    expect(ok.status).toBe(200);
    expect(ok.body.memberCount).toBe(2);
  });

  it('invite code endpoint rejects garbage codes identically', async () => {
    const user = await makeUser();
    const res = await request(app).post('/api/teams/join-code').set(auth(user._id as Types.ObjectId)).send({ code: 'definitely-not-a-real-code-123' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('INVALID_CODE');
  });
});
