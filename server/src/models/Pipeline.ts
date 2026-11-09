import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * A validation pipeline is an ordered list of check steps an organizer
 * attaches to a hackathon. The submission worker resolves
 * submission → team → hackathon → pipeline and evaluates steps in order;
 * each step records pass/fail/warn so results stay explainable.
 */
export const STEP_TYPES = [
  'file-size',        // reject/warn when file exceeds maxMB
  'allowed-types',    // reject/warn when detected type not in whitelist
  'archive-scan',     // zip bomb heuristics: entries, ratio, uncompressed cap
  'link-check',       // submitted links reachable?
  'readme-required',  // archive must contain a README
] as const;
export type StepType = (typeof STEP_TYPES)[number];

const stepSchema = new Schema(
  {
    stepId: { type: String, required: true },
    type: { type: String, enum: STEP_TYPES, required: true },
    enabled: { type: Boolean, default: true },
    // 'reject' → submission REJECTED; 'warn' → NEEDS_FIX
    severity: { type: String, enum: ['reject', 'warn'], default: 'reject' },
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const pipelineSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    steps: { type: [stepSchema], default: [] },
  },
  { timestamps: true },
);

pipelineSchema.index({ ownerId: 1, createdAt: -1 });

export type PipelineDoc = HydratedDocument<InferSchemaType<typeof pipelineSchema>>;
export const Pipeline = model('Pipeline', pipelineSchema);
