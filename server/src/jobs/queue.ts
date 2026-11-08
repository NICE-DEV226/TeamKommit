import { Job } from '../models/Job.js';
import { config } from '../config.js';

/** Enqueue is idempotent: jobId unique → retries/double-enqueue collapse. */
export async function enqueueJob(type: string, payload: Record<string, unknown>, jobId?: string): Promise<void> {
  const id = jobId ?? `${type}:${JSON.stringify(payload)}`;
  await Job.updateOne(
    { jobId: id },
    { $setOnInsert: { type, payload, status: 'PENDING', attempts: 0, maxAttempts: config.jobs.maxAttempts } },
    { upsert: true },
  );
}

/**
 * Lease-based claim: atomically flip PENDING→RUNNING or steal an expired
 * RUNNING lease. Exactly one worker wins because the filter requires the
 * job NOT be RUNNING under a live lease.
 */
export async function claimJob(workerId: string) {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + config.jobs.leaseMs);
  return Job.findOneAndUpdate(
    {
      $or: [
        { status: 'PENDING', runAfter: { $lte: now } },
        { status: 'RUNNING', leaseExpiresAt: { $lte: now } }, // crashed worker
      ],
      attempts: { $lt: config.jobs.maxAttempts },
    },
    {
      $set: { status: 'RUNNING', leaseOwner: workerId, leaseExpiresAt: leaseUntil },
      $inc: { attempts: 1 },
    },
    { sort: { runAfter: 1 }, new: true },
  );
}

export async function completeJob(jobId: string, result: unknown): Promise<void> {
  await Job.updateOne(
    { jobId },
    { $set: { status: 'DONE', result, finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null } },
  );
}

export async function failJob(jobId: string, error: string, attempts: number): Promise<void> {
  const permanent = attempts >= config.jobs.maxAttempts;
  const backoffMs = Math.min(2 ** attempts * 1000, 60_000);
  await Job.updateOne(
    { jobId },
    {
      $set: {
        status: permanent ? 'FAILED' : 'PENDING',
        lastError: error.slice(0, 1000),
        runAfter: new Date(Date.now() + backoffMs),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    },
  );
}
