import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Submission } from '../../models/Submission.js';
import { UploadSession } from '../../models/UploadSession.js';
import { Team } from '../../models/Team.js';
import { Membership } from '../../models/Membership.js';
import { Hackathon } from '../../models/Hackathon.js';
import { validate } from '../middleware/common.js';
import { requireAuth } from '../middleware/auth.js';
import { DomainRejection, forbidden, notFound as nf } from '../../lib/errors.js';
import { config } from '../../config.js';
import * as s3 from '../../storage/s3.js';
import { enqueueJob } from '../../jobs/queue.js';

export const submissionsRouter = Router();
const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

function asyncH(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => { fn(req, res, next).catch(next); };
}

/** Record a late attempt for the organizer dashboard (auditable, cheap). */
async function recordLateAttempt(teamId: Types.ObjectId | undefined, hackathonId: Types.ObjectId | undefined, actorId: Types.ObjectId, reason: string) {
  const { AuditEvent } = await import('../../models/AuditEvent.js');
  await AuditEvent.create({
    teamId, hackathonId, actorId,
    eventType: 'SUBMISSION_LATE_ATTEMPT',
    metadata: { reason },
  });
}

async function requireTeamMember(teamId: Types.ObjectId, userId: Types.ObjectId) {
  const m = await Membership.findOne({ teamId, participantId: userId, status: 'ACTIVE' }).lean();
  if (!m) throw forbidden('Only team members can submit');
  return m;
}

/** Server-clock deadline check — the browser clock is never trusted. */
function deadlineStatus(hackathon: { submissionDeadline?: Date | null } | null): { open: boolean; reason?: string } {
  if (!hackathon?.submissionDeadline) return { open: true };
  const now = Date.now();
  const deadline = hackathon.submissionDeadline.getTime();
  // Grace policy (documented in DESIGN.md):
  // - UPLOADS may complete until deadline + graceUploadMin IF the session
  //   was created before the deadline.
  // - METADATA confirmation accepted until deadline + graceConfirmMin.
  const inGraceUpload = now <= deadline + config.submissions.graceUploadMin * 60_000;
  const inGraceConfirm = now <= deadline + config.submissions.graceConfirmMin * 60_000;
  return { open: inGraceConfirm, reason: inGraceUpload ? 'grace' : undefined };
}

// ---------- Create submission draft (metadata) ----------

const createSchema = z.object({
  hackathonId: oid,
  teamId: oid,
  title: z.string().min(1).max(120),
  description: z.string().max(5000).optional(),
  links: z.array(z.string().url().max(500)).max(config.submissions.maxLinks).optional(),
  repoUrl: z.string().url().max(500).optional(),
});

submissionsRouter.post('/', requireAuth, validate(createSchema), asyncH(async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;
  const team = await Team.findById(body.teamId).lean();
  if (!team || team.lifecycleStatus !== 'ACTIVE') throw nf('Team not found');
  // The team must belong to the hackathon being submitted to — otherwise a
  // member could file under another event's deadline/pipeline/stats.
  if (team.hackathonId.toString() !== body.hackathonId) throw nf('Team not found');
  await requireTeamMember(team._id as Types.ObjectId, req.userId!);

  const hackathon = await Hackathon.findById(body.hackathonId).lean();
  if (!hackathon) throw nf('Hackathon not found');
  const dl = deadlineStatus(hackathon);
  if (!dl.open) {
    await recordLateAttempt(team._id as Types.ObjectId, hackathon._id as Types.ObjectId, req.userId!, 'metadata confirm after deadline+grace');
    throw new DomainRejection('DEADLINE_PASSED', 'The submission deadline has passed', 403);
  }

  const last = await Submission.findOne({ teamId: team._id, hackathonId: hackathon._id }).sort({ version: -1 }).select('version').lean();
  const version = (last?.version ?? 0) + 1;

  const submission = await Submission.create({
    hackathonId: hackathon._id,
    teamId: team._id,
    version,
    title: body.title,
    description: body.description ?? '',
    links: body.links ?? [],
    repoUrl: body.repoUrl,
    fileName: 'pending',
    fileSize: 0,
    fileKey: 'pending',
    status: 'UPLOADING',
    submittedBy: req.userId,
    confirmedAt: new Date(),
  });
  res.status(201).json({ submission });
}));

// ---------- Start a resumable multipart upload ----------

const uploadSchema = z.object({
  submissionId: oid,
  fileName: z.string().min(1).max(255),
  size: z.number().int().min(1).max(config.submissions.maxFileBytes),
  contentType: z.string().max(128).optional(),
});

submissionsRouter.post('/uploads', requireAuth, validate(uploadSchema), asyncH(async (req, res) => {
  const body = req.body as z.infer<typeof uploadSchema>;
  const submission = await Submission.findById(body.submissionId).lean();
  if (!submission) throw nf('Submission not found');
  if (submission.status !== 'UPLOADING') throw new DomainRejection('ALREADY_UPLOADED', 'This submission version already has a file', 409);
  await requireTeamMember(submission.teamId as Types.ObjectId, req.userId!);

  const hackathon = await Hackathon.findById(submission.hackathonId).lean();
  const dl = deadlineStatus(hackathon);
  if (!dl.open) {
    await recordLateAttempt(submission.teamId as Types.ObjectId, submission.hackathonId as Types.ObjectId, req.userId!, 'upload start after deadline+grace');
    throw new DomainRejection('DEADLINE_PASSED', 'Deadline passed — uploads closed', 403);
  }

  const chunkBytes = config.submissions.chunkBytes;
  const partCount = Math.ceil(body.size / chunkBytes);
  const safeName = body.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  const key = `submissions/${submission.hackathonId}/${submission.teamId}/${submission._id}/${safeName}`;

  const { uploadId } = await s3.createMultipartUpload(key, body.contentType ?? 'application/octet-stream');
  const expiresAt = new Date(Date.now() + config.submissions.uploadUrlTtlSec * 1000);

  const session = await UploadSession.create({
    submissionId: submission._id,
    teamId: submission.teamId,
    hackathonId: submission.hackathonId,
    createdBy: req.userId,
    s3UploadId: uploadId,
    s3Key: key,
    fileName: safeName,
    declaredSize: body.size,
    contentType: body.contentType ?? 'application/octet-stream',
    chunkBytes,
    partCount,
    createdBeforeDeadline: !!hackathon?.submissionDeadline && Date.now() <= hackathon.submissionDeadline.getTime(),
    expiresAt,
  });

  // Issue presigned UploadPart URLs for every chunk — client uploads
  // directly to S3/MinIO; the API never proxies file bytes.
  const urls = await Promise.all(
    Array.from({ length: partCount }, async (_, i) => ({
      partNumber: i + 1,
      url: await s3.presignPart(key, uploadId, i + 1),
    })),
  );

  res.status(201).json({ uploadSession: session.toObject(), partUrls: urls });
}));

// ---------- Resume support: which parts are already uploaded? ----------

submissionsRouter.get('/uploads/:sessionId/parts', requireAuth, validate(z.object({ sessionId: oid }), 'params'), asyncH(async (req, res) => {
  const session = await UploadSession.findById(req.params.sessionId).lean();
  if (!session) throw nf('Upload session not found');
  await requireTeamMember(session.teamId as Types.ObjectId, req.userId!);
  const parts = await s3.listParts(session.s3Key, session.s3UploadId);
  res.json({ parts });
}));

// ---------- Complete multipart upload ----------

const completeSchema = z.object({
  sessionId: oid,
  parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string().min(1) })).min(1),
});

submissionsRouter.post('/uploads/complete', requireAuth, validate(completeSchema), asyncH(async (req, res) => {
  const body = req.body as z.infer<typeof completeSchema>;
  const session = await UploadSession.findById(body.sessionId);
  if (!session || session.status !== 'OPEN') throw nf('Upload session not found or closed');
  await requireTeamMember(session.teamId as Types.ObjectId, req.userId!);

  const hackathon = await Hackathon.findById(session.hackathonId).lean();
  const now = Date.now();
  const deadline = hackathon?.submissionDeadline?.getTime();

  // Deadline enforcement on the SERVER clock:
  // - session created before deadline → may complete until deadline+graceUpload
  // - otherwise must complete before the deadline itself
  const allowedUntil = deadline !== undefined
    ? (session.createdBeforeDeadline ? deadline + config.submissions.graceUploadMin * 60_000 : deadline)
    : Infinity;
  if (now > allowedUntil) {
    await s3.abortMultipartUpload(session.s3Key, session.s3UploadId).catch(() => {});
    session.status = 'EXPIRED';
    await session.save();
    await recordLateAttempt(session.teamId as Types.ObjectId, session.hackathonId as Types.ObjectId, req.userId!, 'upload completed after grace window');
    throw new DomainRejection('DEADLINE_PASSED', 'Upload completed after the allowed window', 403);
  }

  try {
    await s3.completeMultipartUpload(session.s3Key, session.s3UploadId, body.parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })));
  } catch (err) {
    throw new DomainRejection('UPLOAD_INCOMPLETE', `Multipart completion failed: ${(err as Error).message}`, 422);
  }

  // Verify real object size server-side.
  const head = await s3.headObject(session.s3Key);
  if (head.size > config.submissions.maxFileBytes) {
    throw new DomainRejection('FILE_TOO_LARGE', 'File exceeds 100 MB', 413);
  }

  session.status = 'COMPLETED';
  session.completedAt = new Date();
  await session.save();

  await Submission.updateOne(
    { _id: session.submissionId },
    {
      $set: {
        fileName: session.fileName,
        fileSize: head.size,
        fileKey: session.s3Key,
        status: 'CHECKING',
      },
    },
  );

  // Exactly-once enqueue: jobId dedupes retries.
  const sub = await Submission.findById(session.submissionId).lean();
  await enqueueJob('submission.check', { submissionId: session.submissionId.toString(), version: sub?.version ?? 0 }, `check:${session.submissionId}:${sub?.version ?? 0}`);

  res.json({ ok: true, fileSize: head.size });
}));

submissionsRouter.post('/uploads/:sessionId/abort', requireAuth, validate(z.object({ sessionId: oid }), 'params'), asyncH(async (req, res) => {
  const session = await UploadSession.findById(req.params.sessionId);
  if (!session || session.status !== 'OPEN') throw nf('Upload session not found');
  await requireTeamMember(session.teamId as Types.ObjectId, req.userId!);
  await s3.abortMultipartUpload(session.s3Key, session.s3UploadId).catch(() => {});
  session.status = 'ABORTED';
  await session.save();
  res.json({ ok: true });
}));

// ---------- Read ----------

submissionsRouter.get('/teams/:teamId', requireAuth, validate(z.object({ teamId: oid }), 'params'), asyncH(async (req, res) => {
  await requireTeamMember(new Types.ObjectId(req.params.teamId), req.userId!);
  const subs = await Submission.find({ teamId: req.params.teamId }).sort({ version: -1 }).limit(20).lean();
  res.json({ submissions: subs });
}));

submissionsRouter.get('/:id', requireAuth, validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const sub = await Submission.findById(req.params.id).lean();
  if (!sub) throw nf('Submission not found');
  await requireTeamMember(sub.teamId as Types.ObjectId, req.userId!);
  res.json({ submission: sub });
}));

// ---------- Organizer dashboard + CSV ----------

submissionsRouter.get('/admin/stats', requireAuth, async (req, res, next) => {
  try {
    if (!req.isOrganizer) throw forbidden('Organizer role required');
    const byStatus = await Submission.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const { AuditEvent } = await import('../../models/AuditEvent.js');
    const lateAttempts = await AuditEvent.countDocuments({ eventType: 'SUBMISSION_LATE_ATTEMPT' });
    const failedChecks = (byStatus.find((s) => s._id === 'NEEDS_FIX')?.count ?? 0)
      + (byStatus.find((s) => s._id === 'REJECTED')?.count ?? 0);
    const total = await Submission.countDocuments({});
    res.json({ total, byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])), lateAttempts, failedChecks });
  } catch (err) { next(err); }
});

// Rich dashboard payload: deadlines, per-hackathon breakdown, recent
// submissions with team names, and the latest late-attempt audit trail.
submissionsRouter.get('/admin/overview', requireAuth, asyncH(async (req, res) => {
  if (!req.isOrganizer) throw forbidden('Organizer role required');
  const { AuditEvent } = await import('../../models/AuditEvent.js');

  const [hackathons, recent, byHackathon, lateAttempts] = await Promise.all([
    Hackathon.find({}).select('name slug status submissionOpensAt submissionDeadline formationClosesAt').sort({ createdAt: -1 }).lean(),
    Submission.find({})
      .sort({ updatedAt: -1 }).limit(12)
      .populate('teamId', 'name')
      .populate('hackathonId', 'name')
      .lean(),
    Submission.aggregate([
      { $group: { _id: { hackathonId: '$hackathonId', status: '$status' }, count: { $sum: 1 } } },
    ]),
    AuditEvent.find({ eventType: 'SUBMISSION_LATE_ATTEMPT' })
      .sort({ occurredAt: -1 }).limit(10)
      .populate('actorId', 'displayName email')
      .populate('teamId', 'name')
      .lean(),
  ]);

  res.json({
    hackathons,
    recent: recent.map((s) => ({
      _id: s._id, title: s.title, status: s.status, version: s.version,
      fileName: s.fileName, updatedAt: s.updatedAt,
      team: (s.teamId as { name?: string } | null)?.name ?? '—',
      hackathon: (s.hackathonId as { name?: string } | null)?.name ?? '—',
    })),
    byHackathon,
    lateAttempts: lateAttempts.map((e) => ({
      occurredAt: e.occurredAt,
      actor: (e.actorId as { displayName?: string } | null)?.displayName ?? '—',
      team: (e.teamId as { name?: string } | null)?.name ?? '—',
      metadata: e.metadata,
    })),
  });
}));

submissionsRouter.get('/admin/export.csv', requireAuth, async (req, res, next) => {
  try {
    if (!req.isOrganizer) throw forbidden('Organizer role required');
    const subs = await Submission.find({}).sort({ createdAt: -1 }).limit(10_000).lean();
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = ['teamId,hackathonId,version,title,status,fileName,fileSize,sha256,confirmedAt,checkedAt,errors'];
    for (const s of subs) {
      rows.push([
        s.teamId, s.hackathonId, s.version, esc(s.title), s.status, esc(s.fileName),
        s.fileSize, s.sha256 ?? '', s.confirmedAt?.toISOString() ?? '', s.checkedAt?.toISOString() ?? '',
        esc(s.checkResults?.problems?.join('; ')),
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="submissions.csv"');
    res.send(rows.join('\n'));
  } catch (err) { next(err); }
});
