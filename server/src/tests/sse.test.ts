import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Types } from 'mongoose';
import type { Server } from 'node:http';
import { setupTestDb, teardownTestDb, makeUser, makeHackathon, makeTeamWithLeader } from './helpers.js';
import { createApp } from '../api/app.js';
import { signAccessToken } from '../api/middleware/auth.js';
import { Membership } from '../models/Membership.js';
import { OutboxEvent } from '../models/OutboxEvent.js';

let server: Server;
let base: string;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await setupTestDb();
  app = createApp();
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterAll(async () => { await new Promise((r) => server.close(r)); await teardownTestDb(); });

/** Read an SSE stream until `marker` appears or timeout — then abort. */
async function readSse(url: string, token: string, marker: string, timeoutMs = 8000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let buf = '';
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' }, signal: ctrl.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    while (!buf.includes(marker)) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      if (buf.length > 64_000) break;
    }
  } catch {
    // aborted by timeout — return whatever we received
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
  return buf;
}

describe('SSE replay (Last-Event-ID)', () => {
  it('replays committed outbox events missed while disconnected', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser();
    const team = await makeTeamWithLeader(hackathon._id as Types.ObjectId, leader._id as Types.ObjectId);
    const member = await makeUser();
    await Membership.create({
      hackathonId: hackathon._id, teamId: team._id, participantId: member._id,
      role: 'MEMBER', status: 'ACTIVE', source: 'JOIN_REQUEST',
    });

    // Marker event id = anything older than the events we're about to create.
    const marker = new Types.ObjectId();
    const ev1 = await OutboxEvent.create({
      aggregateType: 'team', aggregateId: team._id, aggregateVersion: 1,
      eventType: 'team.member.joined',
      payload: { hackathonId: hackathon._id.toString(), teamId: team._id.toString(), userId: member._id.toString() },
    });
    const ev2 = await OutboxEvent.create({
      aggregateType: 'submission', aggregateId: new Types.ObjectId(), aggregateVersion: 1,
      eventType: 'submission.status.changed',
      payload: {
        hackathonId: hackathon._id.toString(), teamId: team._id.toString(),
        submissionId: new Types.ObjectId().toString(), version: 1, status: 'ACCEPTED', errors: [],
      },
    });
    void ev1; void ev2;

    const token = signAccessToken(member._id as Types.ObjectId);
    // lastEventId = an id older than both events → both should replay.
    const stream = await readSse(
      `${base}/api/events?hackathonId=${hackathon._id}&lastEventId=${marker.toHexString()}`,
      token,
      'team.member.joined',
    );
    expect(stream).toContain('event: team.member.joined');
    expect(stream).toContain('event: submission.status.changed');
    // and event ids are present for future Last-Event-ID tracking
    expect(stream).toMatch(/id: [a-f\d]{24}/);
  });

  it('does not replay events the subscriber cannot see', async () => {
    const hackathon = await makeHackathon();
    const outsider = await makeUser();
    const team = await makeTeamWithLeader(hackathon._id as Types.ObjectId, outsider._id as Types.ObjectId);
    // submission event on a DIFFERENT team the outsider isn't a member of
    const otherLeader = await makeUser();
    const otherTeam = await makeTeamWithLeader(hackathon._id as Types.ObjectId, otherLeader._id as Types.ObjectId);
    await OutboxEvent.create({
      aggregateType: 'submission', aggregateId: new Types.ObjectId(), aggregateVersion: 1,
      eventType: 'submission.status.changed',
      payload: {
        hackathonId: hackathon._id.toString(), teamId: otherTeam._id.toString(),
        submissionId: new Types.ObjectId().toString(), version: 1, status: 'ACCEPTED', errors: [],
      },
    });
    // team-scoped stream on own team: only own team's events may appear
    const token = signAccessToken(outsider._id as Types.ObjectId);
    const stream = await readSse(
      `${base}/api/events?teamId=${team._id}&lastEventId=${new Types.ObjectId('000000000000000000000001').toHexString()}`,
      token,
      ': ping', // heartbeat proves stream is alive even with no replay
      6000,
    );
    expect(stream).not.toContain(otherTeam._id.toString());
    expect(stream).toContain('retry: 3000');
  });
});
