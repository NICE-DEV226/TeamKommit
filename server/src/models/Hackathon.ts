import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const hackathonSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    status: { type: String, enum: ['DRAFT', 'REGISTRATION_OPEN', 'FORMATION_OPEN', 'CLOSED', 'ARCHIVED'], default: 'FORMATION_OPEN' },
    minTeamSize: { type: Number, required: true, min: 1, max: 20 },
    maxTeamSize: { type: Number, required: true, min: 1, max: 20 },
    // Server-authoritative formation window. All deadline checks use this.
    formationOpensAt: { type: Date, required: true },
    formationClosesAt: { type: Date, required: true },
    // PS2: project submission deadline + grace policy (documented in DESIGN.md)
    submissionOpensAt: { type: Date },
    submissionDeadline: { type: Date },
    skillTaxonomy: {
      type: [String],
      default: [
        'frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data',
        'ml', 'security', 'design', 'product', 'writing', 'research',
      ],
    },
    leaderSuccessionPolicy: {
      type: String,
      enum: ['OPT_IN_THEN_DISBAN', 'ORGANIZER_FALLBACK'],
      default: 'OPT_IN_THEN_DISBAN',
    },
  },
  { timestamps: true },
);

hackathonSchema.index({ status: 1, formationClosesAt: 1 });

export type HackathonDoc = HydratedDocument<InferSchemaType<typeof hackathonSchema>>;
export const Hackathon = model('Hackathon', hackathonSchema);
