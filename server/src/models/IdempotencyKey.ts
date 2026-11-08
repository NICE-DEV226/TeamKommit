import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { createHash } from 'node:crypto';

export function hashRequest(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

// Idempotency records make retried commands safe:
// - unique (scope, key): only one logical operation per key
// - requestHash: same key + different payload → rejected as key misuse
// - status SUCCEEDED/REJECTED persists the terminal result so retries
//   replay it instead of re-executing
const idempotencyKeySchema = new Schema(
  {
    scope: { type: String, required: true },          // e.g. 'admission', 'team.create'
    key: { type: String, required: true },            // client-supplied Idempotency-Key
    requestHash: { type: String, required: true },
    status: { type: String, enum: ['PROCESSING', 'SUCCEEDED', 'REJECTED'], default: 'PROCESSING' },
    httpStatus: { type: Number },
    result: { type: Schema.Types.Mixed },
    error: { type: String },
    lockedUntil: { type: Date },                      // crash recovery for PROCESSING
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

idempotencyKeySchema.index({ scope: 1, key: 1 }, { unique: true });
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type IdempotencyKeyDoc = HydratedDocument<InferSchemaType<typeof idempotencyKeySchema>>;
export const IdempotencyKey = model('IdempotencyKey', idempotencyKeySchema);
