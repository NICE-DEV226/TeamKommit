import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

// Transactional outbox: written in the SAME transaction as the business
// change. A publisher tails unpublished events and fans them out to SSE.
const outboxEventSchema = new Schema(
  {
    aggregateType: { type: String, required: true },   // 'team' | 'submission' | ...
    aggregateId: { type: Schema.Types.ObjectId, required: true },
    aggregateVersion: { type: Number, required: true },
    eventType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    publishedAt: { type: Date },
    attemptCount: { type: Number, default: 0 },
    lastError: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

outboxEventSchema.index({ publishedAt: 1, _id: 1 }); // publisher scan
outboxEventSchema.index({ aggregateType: 1, aggregateId: 1, aggregateVersion: 1 });

export type OutboxEventDoc = HydratedDocument<InferSchemaType<typeof outboxEventSchema>>;
export const OutboxEvent = model('OutboxEvent', outboxEventSchema);
