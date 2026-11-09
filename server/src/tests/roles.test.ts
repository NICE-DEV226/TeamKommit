import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { setupTestDb, teardownTestDb, makeUser, makeHackathon, makeTeamWithLeader } from './helpers.js';
import { createApp } from '../api/app.js';
import { signAccessToken } from '../api/middleware/auth.js';
import { Team } from '../models/Team.js';
import { Membership } from '../models/Membership.js';
import { JoinRequest } from '../models/JoinRequest.js';
import { OutboxEvent } from '../models/OutboxEvent.js';

/**
 * Authorization matrix — every role × every sensitive endpoint.
 * Guests, non-members, members, leaders, organizers: each gets exactly
 * the surface its role allows, nothing more.
 */
let app: ReturnType<typeof createApp>;
beforeAll(async () => { await setupTestDb(); app = createApp(); });
afterAll(teardownTestDb);

const auth = (userId: Types.ObjectId) => ({ Authorization: `Bearer ${signAccessToken(userId)}` });

// SSE streams never end — supertest can't await them. Spin a real listener
// and check response HEADERS via fetch, aborting the body immediately.
async function sseStatus(path: string, headers: Record<string, string> = {}): Promise<number> {
  const server = app.listen(0);
  try {
    const port = (server.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { accept: 'text/event-stream', ...headers },
      signal: AbortSignal.timeout(3000),
    });
    return res.status;
  } catch {
    return -1; // aborted after headers is fine — we only need the status
  } finally {
    server.close();
  }
}

async function fixture() {
  const hackathon = await makeHackathon();
  const leader = await makeUser();
  const member = await makeUser();
  const outsider = await makeUser();
  const organizer = await makeUser({ isOrganizer: true });
  const joiner = await makeUser();
  const team = await makeTeamWithLeader(hackathon._id as Types.ObjectId, leader._id as Types.ObjectId, { maxSize: 4 });
  // member joins directly (bypasses admit — we're testing HTTP authz, not admission)
  await Membership.create({
    hackathonId: hackathon._id, teamId: team._id, participantId: member._id,
    role: 'MEMBER', status: 'ACTIVE', source: 'JOIN_REQUEST',
  });
  await Team.updateOne({ _id: team._id }, { $inc: { memberCount: 1 } });
  const pendingRequest = await JoinRequest.create({
    hackathonId: hackathon._id, teamId: team._id, participantId: outsider._id, status: 'PENDING',
  });
  return { hackathon, leader, member, outsider, organizer, joiner, team, pendingRequest };
}

describe('role matrix — guest (no token)', () => {
  it('every protected endpoint rejects guests with 401', async () => {
    const { hackathon, team, pendingRequest } = await fixture();
    const tid = team._id.toString();
    const cases: [string, request.Test][] = [
      ['GET /auth/me', request(app).get('/api/auth/me')],
      ['POST /teams', request(app).post('/api/teams').send({ hackathonId: hackathon._id.toString(), name: 'X', maxSize: 3 })],
      ['POST /submissions', request(app).post('/api/submissions').send({ hackathonId: hackathon._id.toString(), teamId: tid, title: 'x' })],
      ['GET /events (SSE)', request(app).get('/api/events')],
      ['GET /teams/:id/requests', request(app).get(`/api/teams/${tid}/requests`)],
      ['GET /teams/:id/suggestions', request(app).get(`/api/teams/${tid}/suggestions`)],
      ['GET /teams/:id/audit', request(app).get(`/api/teams/${tid}/audit`)],
      ['POST /teams/:id/invite-code', request(app).post(`/api/teams/${tid}/invite-code`)],
      ['PATCH /teams/:id', request(app).patch(`/api/teams/${tid}`).send({ name: 'Hijack' })],
      ['POST /requests/:id/accept', request(app).post(`/api/requests/${pendingRequest._id}/accept`)],
      ['POST /teams/:id/join-request', request(app).post(`/api/teams/${tid}/join-request`).send({})],
      ['GET /submissions/admin/stats', request(app).get('/api/submissions/admin/stats')],
      ['GET /submissions/admin/export.csv', request(app).get('/api/submissions/admin/export.csv')],
    ];
    for (const [name, req] of cases) {
      const res = await req;
      expect(res.status, name).toBe(401);
    }
  });
});

describe('role matrix — non-member (authenticated, not in team)', () => {
  it('cannot see or act on team internals', async () => {
    const { hackathon, outsider, joiner, team, pendingRequest } = await fixture();
    const tid = team._id.toString();
    const h = auth(outsider._id as Types.ObjectId);
    const denied: [string, request.Test][] = [
      ['GET requests', request(app).get(`/api/teams/${tid}/requests`).set(h)],
      ['GET suggestions', request(app).get(`/api/teams/${tid}/suggestions`).set(h)],
      ['GET audit', request(app).get(`/api/teams/${tid}/audit`).set(h)],
      ['POST invite-code', request(app).post(`/api/teams/${tid}/invite-code`).set(h)],
      ['PATCH team', request(app).patch(`/api/teams/${tid}`).set(h).send({ name: 'Hijack' })],
      ['POST remove', request(app).post(`/api/teams/${tid}/remove`).set(h).send({ membershipId: 'a'.repeat(24) })],
      ['POST accept request', request(app).post(`/api/requests/${pendingRequest._id}/accept`).set(h)],
      ['POST decline request', request(app).post(`/api/requests/${pendingRequest._id}/decline`).set(h)],
      ['POST submissions', request(app).post('/api/submissions').set(h).send({ hackathonId: hackathon._id.toString(), teamId: tid, title: 'x' })],
    ];
    for (const [name, req] of denied) {
      const res = await req;
      expect([401, 403, 404], `${name} → ${res.status}`).toContain(res.status);
    }
    // …but CAN request to join (fresh user — outsider already has a pending request)
    const join = await request(app).post(`/api/teams/${tid}/join-request`).set(auth(joiner._id as Types.ObjectId)).send({ message: 'hi' });
    expect(join.status).toBe(201);
    const view = await request(app).get(`/api/teams/${tid}`);
    expect(view.status).toBe(200);
  });
});

describe('role matrix — member (active, non-leader)', () => {
  it('can submit + leave, cannot manage the team', async () => {
    const { hackathon, member, team } = await fixture();
    const tid = team._id.toString();
    const hid = hackathon._id.toString();
    const h = auth(member._id as Types.ObjectId);

    // allowed
    expect((await request(app).get(`/api/teams/${tid}/suggestions`).set(h)).status).toBe(200);
    expect((await request(app).get(`/api/teams/${tid}/audit`).set(h)).status).toBe(200);
    expect((await request(app).get('/api/me/teams').set(h)).status).toBe(200);
    const sub = await request(app).post('/api/submissions').set(h).send({ hackathonId: hid, teamId: tid, title: 'Member sub' });
    expect(sub.status).toBe(201);

    // denied
    expect((await request(app).get(`/api/teams/${tid}/requests`).set(h)).status).toBe(403);
    expect((await request(app).post(`/api/teams/${tid}/invite-code`).set(h)).status).toBe(403);
    expect((await request(app).patch(`/api/teams/${tid}`).set(h).send({ name: 'Hijack' })).status).toBe(403);
    const leaderMembership = (await Membership.findOne({ teamId: team._id, role: 'LEADER' }).lean())!;
    expect((await request(app).post(`/api/teams/${tid}/remove`).set(h).send({ membershipId: leaderMembership._id.toString() })).status).toBe(403);
  });
});

describe('role matrix — leader', () => {
  it('full team management surface', async () => {
    const { hackathon, leader, team } = await fixture();
    const tid = team._id.toString();
    const h = auth(leader._id as Types.ObjectId);

    expect((await request(app).get(`/api/teams/${tid}/requests`).set(h)).status).toBe(200);
    expect((await request(app).get(`/api/teams/${tid}/suggestions`).set(h)).status).toBe(200);
    expect((await request(app).get(`/api/teams/${tid}/audit`).set(h)).status).toBe(200);
    const inv = await request(app).post(`/api/teams/${tid}/invite-code`).set(h);
    expect(inv.status).toBe(201);
    expect(inv.body.code).toBeTruthy();
    const patch = await request(app).patch(`/api/teams/${tid}`).set(h).send({ description: 'leader edit' });
    expect(patch.status).toBe(200);
    void hackathon;
  });
});

describe('role matrix — organizer', () => {
  it('admin endpoints: organizer yes, everyone else no', async () => {
    const { member, organizer } = await fixture();
    const org = auth(organizer._id as Types.ObjectId);
    const mem = auth(member._id as Types.ObjectId);

    expect((await request(app).get('/api/submissions/admin/stats').set(org)).status).toBe(200);
    const csv = await request(app).get('/api/submissions/admin/export.csv').set(org);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');

    expect((await request(app).get('/api/submissions/admin/stats').set(mem)).status).toBe(403);
    expect((await request(app).get('/api/submissions/admin/export.csv').set(mem)).status).toBe(403);
  });
});

describe('SSE auth hardening', () => {
  it('?token= works ONLY on /events — never elsewhere', async () => {
    const { outsider } = await fixture();
    const token = signAccessToken(outsider._id as Types.ObjectId);

    expect(await sseStatus(`/api/events?token=${token}`)).toBe(200);
    expect(await sseStatus('/api/events', auth(outsider._id as Types.ObjectId))).toBe(200);
    expect(await sseStatus('/api/events')).toBe(401);

    // …but the same token in ?token= must NOT authenticate other routes
    const me = await request(app).get(`/api/auth/me?token=${token}`);
    expect(me.status).toBe(401);
    const teams = await request(app).get(`/api/me/teams?token=${token}`);
    expect(teams.status).toBe(401);
  });
});

describe('SSE event scoping — replay leaks nothing private', () => {
  // Connect with lastEventId=0…0 (valid ObjectId) → server replays up to 200
  // outbox events through the SAME authorization predicate as live fan-out.
  async function replayEvents(token: string): Promise<string> {
    const server = app.listen(0);
    try {
      const port = (server.address() as { port: number }).port;
      const res = await fetch(
        `http://127.0.0.1:${port}/api/events?token=${token}&lastEventId=000000000000000000000000`,
        { headers: { accept: 'text/event-stream' }, signal: AbortSignal.timeout(4000) },
      );
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let body = '';
      const deadline = Date.now() + 2500;
      while (Date.now() < deadline) {
        const { done, value } = await Promise.race([
          reader.read(),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('read-timeout')), deadline - Date.now())),
        ]).catch(() => ({ done: true as const, value: undefined }));
        if (done || !value) break;
        body += decoder.decode(value, { stream: true });
        if (body.includes('submission.status.changed')) break;
      }
      reader.cancel().catch(() => {});
      return body;
    } finally {
      server.close();
    }
  }

  it('non-member sees public team events but NOT foreign submission events', async () => {
    const { hackathon, member, outsider, team } = await fixture();
    const tid = team._id.toString();
    await OutboxEvent.create([
      {
        aggregateType: 'team', aggregateId: team._id, aggregateVersion: 1,
        eventType: 'team.created',
        payload: { hackathonId: hackathon._id.toString(), teamId: tid, name: 'Public Team' },
      },
      {
        aggregateType: 'submission', aggregateId: new Types.ObjectId(), aggregateVersion: 1,
        eventType: 'submission.status.changed',
        payload: { hackathonId: hackathon._id.toString(), teamId: tid, submissionId: new Types.ObjectId().toString(), version: 1, status: 'ACCEPTED', errors: [] },
      },
    ]);

    const outsiderBody = await replayEvents(signAccessToken(outsider._id as Types.ObjectId));
    expect(outsiderBody).toContain('team.created');           // public board data
    expect(outsiderBody).not.toContain('submission.status.changed'); // private

    const memberBody = await replayEvents(signAccessToken(member._id as Types.ObjectId));
    expect(memberBody).toContain('submission.status.changed'); // own team's event
  });

  it('teamId filter requires membership or organizer', async () => {
    const { outsider, member, organizer, team } = await fixture();
    const tid = team._id.toString();

    const denied = await sseStatus(`/api/events?token=${signAccessToken(outsider._id as Types.ObjectId)}&teamId=${tid}`);
    expect(denied).toBe(403);
    const memberOk = await sseStatus(`/api/events?token=${signAccessToken(member._id as Types.ObjectId)}&teamId=${tid}`);
    expect(memberOk).toBe(200);
    const orgOk = await sseStatus(`/api/events?token=${signAccessToken(organizer._id as Types.ObjectId)}&teamId=${tid}`);
    expect(orgOk).toBe(200);
  });
});

describe('join-request rate limit', () => {
  it('31st request in a minute → 429', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser();
    const spammer = await makeUser();
    const team = await makeTeamWithLeader(hackathon._id as Types.ObjectId, leader._id as Types.ObjectId);
    const h = auth(spammer._id as Types.ObjectId);
    const tid = team._id.toString();
    let last = 0;
    for (let i = 0; i < 31; i++) {
      const res = await request(app).post(`/api/teams/${tid}/join-request`).set(h).send({});
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
