import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { setupTestDb, teardownTestDb, makeUser, makeHackathon, makeTeamWithLeader } from './helpers.js';
import { createApp } from '../api/app.js';
import { signAccessToken } from '../api/middleware/auth.js';
import { createTeam } from '../domain/teams.js';
import { Team } from '../models/Team.js';
import { Membership } from '../models/Membership.js';
import { Submission } from '../models/Submission.js';
import { User } from '../models/User.js';
import { suggestTeammates } from '../domain/matching.js';

let app: ReturnType<typeof createApp>;
beforeAll(async () => { await setupTestDb(); app = createApp(); });
afterAll(teardownTestDb);

const auth = (userId: Types.ObjectId) => ({ Authorization: `Bearer ${signAccessToken(userId)}` });

async function teamWithMember() {
  const hackathon = await makeHackathon({
    submissionDeadline: new Date(Date.now() + 24 * 3600_000),
  });
  const leader = await makeUser({ isOrganizer: true });
  const res = await createTeam({ hackathonId: hackathon._id as Types.ObjectId, creatorId: leader._id as Types.ObjectId, name: 'SubTeam', maxSize: 4 });
  if (!res.ok) throw new Error('setup');
  return { hackathon, leader, teamId: res.teamId };
}

describe('submissions API', () => {
  it('non-member cannot create a submission (403)', async () => {
    const { hackathon, teamId } = await teamWithMember();
    const outsider = await makeUser();
    const res = await request(app).post('/api/submissions').set(auth(outsider._id as Types.ObjectId)).send({
      hackathonId: hackathon._id.toString(), teamId: teamId.toString(), title: 'x',
    });
    expect(res.status).toBe(403);
  });

  it('member creates a versioned submission; second version increments', async () => {
    const { hackathon, leader, teamId } = await teamWithMember();
    const mk = () => request(app).post('/api/submissions').set(auth(leader._id as Types.ObjectId)).send({
      hackathonId: hackathon._id.toString(), teamId: teamId.toString(), title: 'v', links: ['https://example.com'],
    });
    const r1 = await mk();
    const r2 = await mk();
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.body.submission.version).toBe(r1.body.submission.version + 1);
  });

  it('rejects when deadline + grace has passed (server clock)', async () => {
    const past = await makeHackathon({ submissionDeadline: new Date(Date.now() - 2 * 3600_000) });
    const leader = await makeUser();
    const res = await createTeam({ hackathonId: past._id as Types.ObjectId, creatorId: leader._id as Types.ObjectId, name: 'LateTeam', maxSize: 3 });
    if (!res.ok) throw new Error('setup');
    const out = await request(app).post('/api/submissions').set(auth(leader._id as Types.ObjectId)).send({
      hackathonId: past._id.toString(), teamId: res.teamId.toString(), title: 'too late',
    });
    expect(out.status).toBe(403);
    expect(out.body.error.code).toBe('DEADLINE_PASSED');
  });

  it('organizer stats + CSV export require organizer role', async () => {
    const { leader } = await teamWithMember();
    const nonOrg = await makeUser();
    const denied = await request(app).get('/api/submissions/admin/stats').set(auth(nonOrg._id as Types.ObjectId));
    expect(denied.status).toBe(403);
    const ok = await request(app).get('/api/submissions/admin/stats').set(auth(leader._id as Types.ObjectId));
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveProperty('byStatus');
    const csv = await request(app).get('/api/submissions/admin/export.csv').set(auth(leader._id as Types.ObjectId));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('teamId,hackathonId');
  });
});

describe('suggestions scoring', () => {
  it('returns decomposed scores with reasons, excludes ineligible', async () => {
    const hackathon = await makeHackathon();
    const leader = await makeUser();
    const res = await createTeam({
      hackathonId: hackathon._id as Types.ObjectId, creatorId: leader._id as Types.ObjectId,
      name: 'Suggest', maxSize: 4, skillsSought: ['backend', 'design'],
    });
    if (!res.ok) throw new Error('setup');

    // candidate: looking, discoverable, complementary skills
    await makeUser({
      lookingForTeam: true, discoverable: true,
      skills: [{ skill: 'design', level: 0.9 }, { skill: 'backend', level: 0.8 }],
      preferredRoles: ['design'],
    });
    // ineligible: already on a team → must NOT appear
    const busy = await makeUser({ lookingForTeam: true, discoverable: true, skills: [{ skill: 'backend', level: 1 }] });
    const otherLeader = await makeUser();
    await makeTeamWithLeader(hackathon._id as Types.ObjectId, otherLeader._id as Types.ObjectId);
    await Membership.create({ hackathonId: hackathon._id, teamId: (await Team.findOne({ leaderId: otherLeader._id }).lean())!._id, participantId: busy._id, role: 'MEMBER', status: 'ACTIVE', source: 'JOIN_REQUEST' });

    const suggestions = await suggestTeammates(res.teamId, hackathon._id as Types.ObjectId);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    const s = suggestions[0]!;
    expect(s.mutualScore).toBeGreaterThan(0);
    expect(s.teamContribution).toBeGreaterThanOrEqual(0);
    expect(s.participantFit).toBeGreaterThanOrEqual(0);
    expect(s.reasons.length).toBeGreaterThan(0);
    expect(suggestions.find((x) => x.userId.toString() === busy._id.toString())).toBeUndefined();
  });
});
