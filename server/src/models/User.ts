import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const skillDecl = new Schema(
  {
    skill: { type: String, required: true }, // canonical skill id
    level: { type: Number, min: 0, max: 1, default: 0.5 }, // self-declared 0..1
    canLead: { type: Boolean, default: false },
  },
  { _id: false },
);

const availabilityWindow = new Schema(
  {
    // Minutes-from-midnight-UTC based recurring windows, kept coarse on purpose.
    dayOfWeek: { type: Number, min: 0, max: 6 }, // 0=Sun; omit = every day
    startMin: { type: Number, min: 0, max: 1439 },
    endMin: { type: Number, min: 0, max: 1439 },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    bio: { type: String, default: '', maxlength: 500 },
    timezone: { type: String, default: 'UTC' },
    skills: { type: [skillDecl], default: [] },
    preferredRoles: { type: [String], default: [] },
    availability: { type: [availabilityWindow], default: [] },
    lookingForTeam: { type: Boolean, default: false },
    // Discovery privacy: participants only appear in the people board if opted in.
    discoverable: { type: Boolean, default: true },
    isOrganizer: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    // Hashed single-use tokens (sha256) — raw token only ever lives in the email link.
    verifyTokenHash: { type: String },
    verifyTokenExpires: { type: Date },
    resetTokenHash: { type: String },
    resetTokenExpires: { type: Date },
    refreshTokenHash: { type: String },
  },
  { timestamps: true },
);

userSchema.index({ lookingForTeam: 1, discoverable: 1 });
userSchema.index({ verifyTokenHash: 1 }, { sparse: true });
userSchema.index({ resetTokenHash: 1 }, { sparse: true });

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);
