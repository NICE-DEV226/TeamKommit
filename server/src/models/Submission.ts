import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

const stepResultSchema = new Schema(
  { stepId: String, type: String, status: String, detail: String },
  { _id: false },
);

// Immutable submission versions. "Last version before deadline counts" is
// enforced by always appending a new doc; the effective submission is the
// highest version with confirmedAt <= deadline (+ documented grace).
const submissionSchema = new Schema(
  {
    hackathonId: { type: Schema.Types.ObjectId, ref: 'Hackathon', required: true },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
    version: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 5000 },
    links: { type: [String], default: [], validate: (v: string[]) => v.length <= 10 },
    repoUrl: { type: String, maxlength: 500 },
    fileName: { type: String, required: true },
    fileSize: { type: Number, required: true },
    fileKey: { type: String, required: true }, // S3 key of the winning upload
    sha256: { type: String },
    status: {
      type: String,
      enum: ['UPLOADING', 'CHECKING', 'ACCEPTED', 'NEEDS_FIX', 'REJECTED', 'LATE'],
      default: 'UPLOADING',
    },
    checkResults: {
      type: {
        fileType: { type: String },
        isZipBomb: { type: Boolean },
        archiveEntries: { type: Number },
        linksOk: { type: [String] },
        linksFailed: { type: [String] },
        preview: { type: String },   // extracted README head or PDF page-1 text
        problems: { type: [String] },
        // Which validation pipeline ran + per-step outcomes (explainability).
        pipeline: {
          name: { type: String },
          steps: { type: [stepResultSchema], default: undefined },
        },
      },
      default: undefined,
    },
    submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    confirmedAt: { type: Date }, // when metadata was finalized (deadline check point)
    checkedAt: { type: Date },
  },
  { timestamps: true },
);

submissionSchema.index({ teamId: 1, hackathonId: 1, version: -1 });
submissionSchema.index({ hackathonId: 1, status: 1 });
submissionSchema.index({ status: 1, createdAt: 1 }); // dashboard scans
// The "counts" rule: at most one ACCEPTED/terminal latest per team is derived
// in queries; versions are never mutated.

export type SubmissionDoc = HydratedDocument<InferSchemaType<typeof submissionSchema>>;
export const Submission = model('Submission', submissionSchema);
