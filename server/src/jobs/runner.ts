import { config } from '../config.js';
import { claimJob, completeJob, failJob } from './queue.js';
import { handleSubmissionCheck } from './handlers.js';

const HANDLERS: Record<string, (payload: never) => Promise<unknown>> = {
  'submission.check': handleSubmissionCheck as never,
};

/** Poll loop — assumes the DB connection is already established. */
export async function startWorkerLoop(): Promise<never> {
  console.log(`[worker] ${config.jobs.workerId} started`);
  for (;;) {
    const job = await claimJob(config.jobs.workerId);
    if (!job) {
      await new Promise((r) => setTimeout(r, config.jobs.pollIntervalMs));
      continue;
    }
    const handler = HANDLERS[job.type];
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      const result = await handler(job.payload as never);
      await completeJob(job.jobId, result);
      console.log(`[worker] ${job.jobId} DONE`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await failJob(job.jobId, msg, job.attempts);
      console.error(`[worker] ${job.jobId} attempt ${job.attempts} failed: ${msg}`);
    }
  }
}
