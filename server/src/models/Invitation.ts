import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';

export function hashInviteCode(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateInviteCode(): { raw: string; hash: string } {
  const raw = randomBytes(config.invite.codeBytes).toString('base64url');
  return { raw, hash: hashInviteCode(raw) };
}

const invitationSchema = new Schema(
  {
    hackathonId: { type: Schema.Types.ObjectId, ref: 'Hackathon', required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    inviterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    inviteeId: { type: Schema.Types.ObjectId, ref: 'User' }, // addressed invite
    // Shareable code invite: only the hash is stored, never the raw code.
    codeHash: { type: String, index: true },
    kind: { type: String, enum: ['DIRECT', 'CODE'], default: 'DIRECT' },
    status: { type: String, enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED'], default: 'PENDING' },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
    decidedAt: { type: Date },
  },
  { timestamps: true },
);

invitationSchema.index({ codeHash: 1, status: 1 });
invitationSchema.index({ inviteeId: 1, status: 1 });
invitationSchema.index({ teamId: 1, status: 1 });

export type InvitationDoc = HydratedDocument<InferSchemaType<typeof invitationSchema>>;
export const Invitation = model('Invitation', invitationSchema);
