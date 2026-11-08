import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

// Durable job queue with lease-based claiming → exactly-once effect:
// a crashed worker's lease expires and the job is retried, but every check
// writes its result under the SAME jobId, so retries can never duplicate.
const jobSchema = new Schema(
  {
    jobId: { type: String, required: true, unique: true }, // dedupe key, e.g. check:<submissionId>:<version>
    type: { type: String, required: true },                // 'submission.check'
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'RUNNING', 'DONE', 'FAILED'],
      default: 'PENDING',
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    leaseOwner: { type: String },
    leaseExpiresAt: { type: Date },
    runAfter: { type: Date, default: Date.now },           // backoff support
    lastError: { type: String },
    result: { type: Schema.Types.Mixed },
    finishedAt: { type: Date },
  },
  { timestamps: true },
);

// Claim query: PENDING due jobs OR RUNNING with expired lease.
jobSchema.index({ status: 1, runAfter: 1, leaseExpiresAt: 1 });
jobSchema.index({ type: 1, status: 1 });

export type JobDoc = HydratedDocument<InferSchemaType<typeof jobSchema>>;
export const Job = model('Job', jobSchema);
