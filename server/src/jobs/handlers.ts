import { Types } from 'mongoose';
import { Submission } from '../models/Submission.js';
import { OutboxEvent } from '../models/OutboxEvent.js';
import { runFileCheck } from './checks.js';

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

  const { file, links } = await runFileCheck(submission.fileKey, submission.links);

  const errors = [...file.errors];
  if (links.failed.length > 0 && links.failed.length === submission.links.length && submission.links.length > 0) {
    errors.push('All submitted links are unreachable');
  }
  const rejected = file.fileType === 'rejected' || file.isZipBomb || errors.some((e) => e.includes('exceeds'));
  const needsFix = !rejected && (links.failed.length > 0 || file.fileType === 'unknown');
  const status = rejected ? 'REJECTED' : needsFix ? 'NEEDS_FIX' : 'ACCEPTED';

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
