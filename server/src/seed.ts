import { connectDb, disconnectDb } from './db.js';
import { Hackathon } from './models/Hackathon.js';
import { User } from './models/User.js';
import { Team } from './models/Team.js';
import { Membership } from './models/Membership.js';
import { makePersona, SKILL_IDS as SKILLS } from './personas.js';
import bcrypt from 'bcryptjs';

/**
 * Seed: 1 hackathon, 10 000 users, 2 000 teams (5 members each = 10k slots).
 * Deterministic-ish, bulk-inserted for speed. Usage: npm run seed
 */
const N_USERS = 10_000;
const N_TEAMS = 2_000;
const TEAM_SIZE = 5;

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

async function main() {
  await connectDb();
  console.log('[seed] wiping collections…');
  await Promise.all([
    Hackathon.deleteMany({}), User.deleteMany({}), Team.deleteMany({}),
    Membership.deleteMany({}),
    import('./models/Invitation.js').then((m) => m.Invitation.deleteMany({})),
    import('./models/JoinRequest.js').then((m) => m.JoinRequest.deleteMany({})),
    import('./models/Submission.js').then((m) => m.Submission.deleteMany({})),
    import('./models/Job.js').then((m) => m.Job.deleteMany({})),
    import('./models/AuditEvent.js').then((m) => m.AuditEvent.deleteMany({})),
    import('./models/OutboxEvent.js').then((m) => m.OutboxEvent.deleteMany({})),
    import('./models/IdempotencyKey.js').then((m) => m.IdempotencyKey.deleteMany({})),
  ]);

  const now = Date.now();
  const hackathon = await Hackathon.create({
    name: 'Hack4Hack 2026',
    slug: 'hack4hack-2026',
    status: 'FORMATION_OPEN',
    minTeamSize: 2,
    maxTeamSize: 6,
    formationOpensAt: new Date(now - 24 * 3600_000),
    formationClosesAt: new Date(now + 7 * 24 * 3600_000),
    submissionOpensAt: new Date(now + 6 * 24 * 3600_000),
    submissionDeadline: new Date(now + 8 * 24 * 3600_000),
  });
  console.log('[seed] hackathon', hackathon._id);

  // --- Users ---
  console.log(`[seed] creating ${N_USERS} users…`);
  const passwordHash = await bcrypt.hash('password123', 10);
  const userDocs = [];
  for (let i = 0; i < N_USERS; i++) {
    const persona = makePersona(rand, i);
    userDocs.push({
      email: `user${i}@seed.teamkommit.dev`,
      passwordHash,
      emailVerified: true,
      ...persona,
    });
  }
  const users = await User.insertMany(userDocs, { ordered: false });
  console.log(`[seed] ${users.length} users created`);

  // --- Teams + memberships ---
  console.log(`[seed] creating ${N_TEAMS} teams…`);
  const teamDocs = [];
  const membershipDocs: Record<string, unknown>[] = [];
  for (let t = 0; t < N_TEAMS; t++) {
    const leaderIdx = t * TEAM_SIZE;
    const memberIdxs = Array.from({ length: TEAM_SIZE }, (_, k) => leaderIdx + k);
    const teamName = `Team Alpha-${String(t).padStart(4, '0')}`;
    const heldSkills = [...new Set(users.slice(leaderIdx, leaderIdx + TEAM_SIZE).flatMap((u) => u.skills.map((s) => s.skill)))].slice(0, 6);
    teamDocs.push({
      hackathonId: hackathon._id,
      name: teamName,
      slug: `team-alpha-${String(t).padStart(4, '0')}`,
      description: `Seeded team ${t} building something great`,
      leaderId: users[leaderIdx]!._id,
      minSize: 2,
      maxSize: 6,
      memberCount: TEAM_SIZE,
      skillsHeld: heldSkills,
      skillsSought: SKILLS.filter((s) => !heldSkills.includes(s)).slice(0, 3),
      formationMessage: 'Looking for teammates!',
      version: 1,
    });
    memberIdxs.forEach((uIdx, k) => {
      membershipDocs.push({
        hackathonId: hackathon._id,
        teamId: null, // patched after team insert (need ObjectIds)
        participantId: users[uIdx]!._id,
        role: k === 0 ? 'LEADER' : 'MEMBER',
        status: 'ACTIVE',
        source: 'CREATOR',
        openToLead: rand() > 0.7,
        joinedAt: new Date(now - Math.floor(rand() * 48) * 3600_000),
      });
    });
  }
  const teams = await Team.insertMany(teamDocs, { ordered: false });
  for (let t = 0; t < N_TEAMS; t++) {
    for (let k = 0; k < TEAM_SIZE; k++) {
      membershipDocs[t * TEAM_SIZE + k]!.teamId = teams[t]!._id;
    }
  }
  await Membership.insertMany(membershipDocs, { ordered: false });
  console.log(`[seed] ${teams.length} teams + ${membershipDocs.length} memberships created`);
  console.log('[seed] done ✔');
  await disconnectDb();
}

main().catch((err) => { console.error(err); process.exit(1); });
