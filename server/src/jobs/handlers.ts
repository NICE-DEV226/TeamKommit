import { Types } from 'mongoose';
import { Submission } from '../models/Submission.js';
import { OutboxEvent } from '../models/OutboxEvent.js';
import { Hackathon } from '../models/Hackathon.js';
import { Pipeline } from '../models/Pipeline.js';
import { Team } from '../models/Team.js';
import { Membership } from '../models/Membership.js';
import { User } from '../models/User.js';
import { sendMailAsync, submissionStatusEmail } from '../mail.js';
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

  // Notify every active team member — best-effort, mail failure is logged only.
  try {
    const [team, members] = await Promise.all([
      Team.findById(submission.teamId).select('name').lean(),
      Membership.find({ teamId: submission.teamId, status: 'ACTIVE' }).select('participantId').lean(),
    ]);
    const users = await User.find({ _id: { $in: members.map((m) => m.participantId) } })
      .select('email displayName').lean();
    const detail = errors.length ? errors[0] : undefined;
    for (const u of users) {
      sendMailAsync(submissionStatusEmail(
        { email: u.email, name: u.displayName },
        team?.name ?? 'your team', version, status, detail,
      ));
    }
  } catch (err) {
    console.error('[mail] submission notification failed:', err);
  }

  return { status, fileType: file.fileType, errors };
}
