import { Types } from 'mongoose';
import { Submission } from '../models/Submission.js';
import { OutboxEvent } from '../models/OutboxEvent.js';
import { Hackathon } from '../models/Hackathon.js';
import { Pipeline } from '../models/Pipeline.js';
import { runFileCheck, type PipelineStep } from './checks.js';

interface CheckPayload {
  submissionId: string;
  version: number;
}

/**
 * 'submission.check' handler. Idempotent by construction: the jobId is
 * check:<submissionId>:<version> and all writes are keyed to that exact
 * version — a retry after a crash recomputes and overwrites the same
 * checkResults, never creating duplicates.
 */
export async function handleSubmissionCheck(payload: CheckPayload): Promise<unknown> {
  const submission = await Submission.findOne({
    _id: new Types.ObjectId(payload.submissionId),
    version: payload.version,
  });
  if (!submission) return { skipped: 'submission version not found' };
  if (submission.status === 'ACCEPTED' || submission.status === 'REJECTED') {
    return { skipped: 'already terminal' };
  }

  await Submission.updateOne(
    { _id: submission._id },
    { $set: { status: 'CHECKING' } },
  );

  // Resolve the organizer-configured validation pipeline for this event.
  // No pipeline → runFileCheck falls back to the default step set.
  let steps: PipelineStep[] | undefined;
  let pipelineName: string | undefined;
  const hackathon = await Hackathon.findById(submission.hackathonId).select('pipelineId').lean();
  if (hackathon?.pipelineId) {
    const pipeline = await Pipeline.findById(hackathon.pipelineId).select('name steps').lean();
    if (pipeline) {
      pipelineName = pipeline.name;
      steps = pipeline.steps as unknown as PipelineStep[];
    }
  }

  const { file, links, verdict } = await runFileCheck(submission.fileKey, submission.links, steps);

  const errors = verdict.problems;
  const status = verdict.rejected ? 'REJECTED' : verdict.needsFix ? 'NEEDS_FIX' : 'ACCEPTED';

  const version = submission.version;
  await Submission.updateOne(
    { _id: submission._id },
    {
      $set: {
        status,
        checkedAt: new Date(),
        checkResults: {
          fileType: file.fileType,
          isZipBomb: file.isZipBomb,
          archiveEntries: file.archiveEntries,
          linksOk: links.ok,
          linksFailed: links.failed,
          preview: file.preview,
          problems: errors,
          pipeline: {
            name: pipelineName ?? 'default',
            steps: verdict.results,
          },
        },
      },
    },
  );

  await OutboxEvent.create({
    aggregateType: 'submission',
    aggregateId: submission._id,
    aggregateVersion: version,
    eventType: 'submission.status.changed',
    payload: {
      hackathonId: submission.hackathonId.toString(),
      teamId: submission.teamId.toString(),
      submissionId: submission._id.toString(),
      version,
      status,
      errors,
    },
  });

  return { status, fileType: file.fileType, errors };
}
