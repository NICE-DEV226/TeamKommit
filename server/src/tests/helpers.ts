import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { beforeAll, afterAll } from 'vitest';

/**
 * Shared test harness: an in-memory single-node replica set so real
 * multi-document transactions work exactly as in production.
 */
let replSet: MongoMemoryReplSet;

export async function setupTestDb() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = replSet.getUri('teamkommit-test');
  await mongoose.connect(uri);
  await connectModels();
}

export async function teardownTestDb() {
  await mongoose.disconnect();
  await replSet.stop();
}

export { replSet };

// Import all models so indexes/collections exist.
export async function connectModels() {
  await import('../models/Hackathon.js');
  await import('../models/User.js');
  await import('../models/Team.js');
  await import('../models/Membership.js');
  await import('../models/Invitation.js');
  await import('../models/JoinRequest.js');
  await import('../models/AuditEvent.js');
  await import('../models/OutboxEvent.js');
  await import('../models/IdempotencyKey.js');
  await import('../models/UploadSession.js');
  await import('../models/Submission.js');
  await import('../models/Job.js');
  await import('../models/Pipeline.js');
  await Promise.all([
    mongoose.model('Hackathon').syncIndexes(),
    mongoose.model('User').syncIndexes(),
    mongoose.model('Team').syncIndexes(),
    mongoose.model('Membership').syncIndexes(),
    mongoose.model('Invitation').syncIndexes(),
    mongoose.model('JoinRequest').syncIndexes(),
    mongoose.model('AuditEvent').syncIndexes(),
    mongoose.model('OutboxEvent').syncIndexes(),
    mongoose.model('IdempotencyKey').syncIndexes(),
    mongoose.model('UploadSession').syncIndexes(),
    mongoose.model('Submission').syncIndexes(),
    mongoose.model('Job').syncIndexes(),
    mongoose.model('Pipeline').syncIndexes(),
  ]);
}

export async function makeUser(overrides: Record<string, unknown> = {}) {
  const { User } = await import('../models/User.js');
  const n = Math.random().toString(36).slice(2, 10);
  return User.create({
    email: `u-${n}@test.dev`,
    passwordHash: await bcrypt.hash('password123', 4),
    displayName: `User ${n}`,
    timezone: 'UTC',
    skills: [{ skill: 'backend', level: 0.7 }],
    ...overrides,
  });
}

export async function makeHackathon(overrides: Record<string, unknown> = {}) {
  const { Hackathon } = await import('../models/Hackathon.js');
  const now = Date.now();
  return Hackathon.create({
    name: 'TestHack', slug: `test-${Math.random().toString(36).slice(2, 8)}`,
    status: 'FORMATION_OPEN', minTeamSize: 2, maxTeamSize: 6,
    formationOpensAt: new Date(now - 3600_000),
    formationClosesAt: new Date(now + 7 * 24 * 3600_000),
    ...overrides,
  });
}

export async function makeTeamWithLeader(hackathonId: Types.ObjectId, leaderId: Types.ObjectId, opts: { maxSize?: number; memberCount?: number; recruitmentStatus?: string } = {}) {
  const { Team } = await import('../models/Team.js');
  const { Membership } = await import('../models/Membership.js');
  const maxSize = opts.maxSize ?? 4;
  const team = await Team.create({
    hackathonId, name: `T-${Math.random().toString(36).slice(2, 6)}`, slug: `t-${Math.random().toString(36).slice(2, 10)}`,
    leaderId, minSize: 2, maxSize, memberCount: opts.memberCount ?? 1,
    recruitmentStatus: (opts.recruitmentStatus as 'OPEN' | 'PAUSED' | 'CLOSED') ?? 'OPEN',
  });
  await Membership.create({
    hackathonId, teamId: team._id, participantId: leaderId, role: 'LEADER', status: 'ACTIVE', source: 'CREATOR',
  });
  return team;
}
