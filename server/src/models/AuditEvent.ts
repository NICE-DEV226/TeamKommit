import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

// Immutable business audit trail — who, what, when, on which aggregate.
const auditEventSchema = new Schema(
  {
    hackathonId: { type: Schema.Types.ObjectId, ref: 'Hackathon' },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team' },
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },       // who did it
    subjectId: { type: Schema.Types.ObjectId, ref: 'User' },     // who it affected
    eventType: { type: String, required: true },                  // e.g. TEAM_MEMBER_ADMITTED
    operationId: { type: String },                                // idempotency key
    aggregateVersion: { type: Number },                           // team.version at commit
    metadata: { type: Schema.Types.Mixed },
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

auditEventSchema.index({ teamId: 1, occurredAt: -1 });
auditEventSchema.index({ hackathonId: 1, occurredAt: -1 });
auditEventSchema.index({ actorId: 1, occurredAt: -1 });

export type AuditEventDoc = HydratedDocument<InferSchemaType<typeof auditEventSchema>>;
export const AuditEvent = model('AuditEvent', auditEventSchema);
