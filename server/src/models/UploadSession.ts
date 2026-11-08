import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

// One resumable multipart upload session per submission file.
// The API server NEVER streams file bytes: it only issues presigned
// UploadPart URLs and later calls Complete/Abort on S3.
const uploadSessionSchema = new Schema(
  {
    submissionId: { type: Schema.Types.ObjectId, ref: 'Submission', required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    hackathonId: { type: Schema.Types.ObjectId, ref: 'Hackathon', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    s3UploadId: { type: String, required: true },
    s3Key: { type: String, required: true },
    fileName: { type: String, required: true, maxlength: 255 },
    declaredSize: { type: Number, required: true, min: 1 },
    contentType: { type: String, default: 'application/octet-stream' },
    chunkBytes: { type: Number, required: true },
    partCount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['OPEN', 'COMPLETED', 'ABORTED', 'EXPIRED'],
      default: 'OPEN',
    },
    // Deadline policy: session created before deadline may complete within grace.
    createdBeforeDeadline: { type: Boolean, required: true },
    expiresAt: { type: Date, required: true },
    completedAt: { type: Date },
    sha256: { type: String }, // filled after complete + HEAD verify
  },
  { timestamps: true },
);

uploadSessionSchema.index({ submissionId: 1, status: 1 });
uploadSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
uploadSessionSchema.index({ teamId: 1, createdAt: -1 });

export type UploadSessionDoc = HydratedDocument<InferSchemaType<typeof uploadSessionSchema>>;
export const UploadSession = model('UploadSession', uploadSessionSchema);
