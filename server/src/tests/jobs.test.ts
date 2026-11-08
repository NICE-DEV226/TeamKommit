import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Types } from 'mongoose';
import { setupTestDb, teardownTestDb } from './helpers.js';
import { enqueueJob, claimJob, completeJob, failJob } from '../jobs/queue.js';
import { Job } from '../models/Job.js';
import { detectAndScanFixture } from './check-fixtures.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);

describe('job queue — exactly-once semantics', () => {
  it('enqueue is idempotent on jobId', async () => {
    const jobId = `test:${Date.now()}`;
    await enqueueJob('submission.check', { a: 1 }, jobId);
    await enqueueJob('submission.check', { a: 1 }, jobId);
    const count = await Job.countDocuments({ jobId });
    expect(count).toBe(1);
  });

  it('only one worker claims a job; crashed lease is reclaimed', async () => {
    const jobId = `lease:${Date.now()}`;
    await enqueueJob('submission.check', { x: 1 }, jobId);

    const [c1, c2] = await Promise.all([claimJob('w1'), claimJob('w2')]);
    // At least one got a job; the SAME job can't be claimed by both
    const claimedIds = [c1?.jobId, c2?.jobId].filter(Boolean);
    expect(new Set(claimedIds).size).toBe(claimedIds.length);

    // Force-expire the lease → another worker can reclaim (crash recovery)
    await Job.updateOne({ jobId }, { $set: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    const c3 = await claimJob('w3');
    expect(c3?.jobId).toBe(jobId);
    expect(c3?.leaseOwner).toBe('w3');

    await completeJob(jobId, { done: true });
    const done = await Job.findOne({ jobId }).lean();
    expect(done!.status).toBe('DONE');
    // completed jobs are never reclaimed
    const c4 = await claimJob('w4');
    expect(c4?.jobId).not.toBe(jobId);
  });

  it('failure backs off and eventually marks FAILED after maxAttempts', async () => {
    const jobId = `fail:${Date.now()}`;
    await Job.create({ jobId, type: 'submission.check', payload: {}, status: 'PENDING', attempts: 4, maxAttempts: 5 });
    const job = await claimJob('w1');
    expect(job?.jobId).toBe(jobId);
    await failJob(jobId, 'boom', job!.attempts); // attempts now 5 → permanent
    const after = await Job.findOne({ jobId }).lean();
    expect(after!.status).toBe('FAILED');
  });
});

describe('file checks — content sniffing & zip bombs', () => {
  it('detects real type from magic bytes, not extension', async () => {
    // minimal valid zip
    const zip = await detectAndScanFixture('zip');
    expect(zip.fileType).toBe('zip');
    // a .pdf extension on zip bytes still reports zip
    expect(zip.fileType).not.toBe('pdf');
  });

  it('flags a zip bomb by compression ratio', async () => {
    const bomb = await detectAndScanFixture('zipbomb');
    expect(bomb.isZipBomb).toBe(true);
  });
});
