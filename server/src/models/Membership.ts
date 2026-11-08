import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const membershipSchema = new Schema(
  {
    hackathonId: { type: Schema.Types.ObjectId, ref: 'Hackathon', required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    participantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['LEADER', 'MEMBER'], required: true },
    status: { type: String, enum: ['ACTIVE', 'LEFT', 'REMOVED'], default: 'ACTIVE' },
    // succession opt-in: member agrees to be considered for leadership
    openToLead: { type: Boolean, default: false },
    successionRank: { type: Number }, // assigned when leader leaves
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date },
    source: { type: String, enum: ['CREATOR', 'INVITATION', 'JOIN_REQUEST', 'INVITE_CODE'], required: true },
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// THE key invariant: one ACTIVE membership per participant per hackathon.
// Partial unique index → MongoDB rejects a second concurrent admission
// even if application checks raced.
membershipSchema.index(
  { hackathonId: 1, participantId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } },
);
membershipSchema.index({ teamId: 1, status: 1 });
// Fast leadership/succession lookups
membershipSchema.index({ teamId: 1, role: 1, status: 1, openToLead: 1 });

export type MembershipDoc = HydratedDocument<InferSchemaType<typeof membershipSchema>>;
export const Membership = model('Membership', membershipSchema);
