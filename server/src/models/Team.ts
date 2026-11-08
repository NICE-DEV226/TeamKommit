import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const teamSchema = new Schema(
  {
    hackathonId: { type: Schema.Types.ObjectId, ref: 'Hackathon', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true },
    description: { type: String, default: '', maxlength: 2000 },
    leaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    minSize: { type: Number, required: true, min: 1 },
    maxSize: { type: Number, required: true, min: 1 },
    // Maintained aggregate — MUST equal count of ACTIVE memberships.
    // Protected by the conditional update inside admit(); reconciled by a job.
    memberCount: { type: Number, default: 1, min: 0 },
    lifecycleStatus: { type: String, enum: ['ACTIVE', 'DISBANDED'], default: 'ACTIVE' },
    recruitmentStatus: { type: String, enum: ['OPEN', 'PAUSED', 'CLOSED'], default: 'OPEN' },
    // optimistic concurrency for leadership/config mutations
    version: { type: Number, default: 0 },
    // Denormalized board read-model fields (rebuilt by projector)
    skillsSought: { type: [String], default: [] },
    skillsHeld: { type: [String], default: [] },
    formationMessage: { type: String, default: '', maxlength: 280 },
    // Set when counter reconciliation fails — blocks new admissions.
    admissionsHalted: { type: Boolean, default: false },
  },
  { timestamps: true },
);

teamSchema.index({ hackathonId: 1, slug: 1 }, { unique: true });
// Board query path: equality fields → memberCount sort → _id tiebreak (stable pagination)
teamSchema.index({ hackathonId: 1, lifecycleStatus: 1, recruitmentStatus: 1, memberCount: 1, _id: 1 });

export type TeamDoc = HydratedDocument<InferSchemaType<typeof teamSchema>>;
export const Team = model('Team', teamSchema);
