import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const joinRequestSchema = new Schema(
  {
    hackathonId: { type: Schema.Types.ObjectId, ref: 'Hackathon', required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    participantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'], default: 'PENDING' },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
  },
  { timestamps: true },
);

// One live request per participant per team; history kept via status.
joinRequestSchema.index(
  { teamId: 1, participantId: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' } },
);
joinRequestSchema.index({ hackathonId: 1, participantId: 1, status: 1 });
joinRequestSchema.index({ teamId: 1, status: 1 });

export type JoinRequestDoc = HydratedDocument<InferSchemaType<typeof joinRequestSchema>>;
export const JoinRequest = model('JoinRequest', joinRequestSchema);
