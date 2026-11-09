import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Hackathon } from '../../models/Hackathon.js';
import { Team } from '../../models/Team.js';
import { Membership } from '../../models/Membership.js';
import { User } from '../../models/User.js';
import { Submission } from '../../models/Submission.js';
import { JoinRequest } from '../../models/JoinRequest.js';
import { AuditEvent } from '../../models/AuditEvent.js';
import { Pipeline } from '../../models/Pipeline.js';
import { validate } from '../middleware/common.js';
import { requireAuth, requireOrganizer } from '../middleware/auth.js';
import { badRequest, forbidden, notFound as nf } from '../../lib/errors.js';
import { withTransaction } from '../../db.js';

export const adminRouter = Router();
const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const dt = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/));

function slugify(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'event';
}

function asyncH(fn: (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<unknown>) {
  return (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => { fn(req, res, next).catch(next); };
}

adminRouter.use(requireAuth, requireOrganizer);

// ---------- Hackathons (events) ----------

adminRouter.get('/hackathons', asyncH(async (_req, res) => {
  const hackathons = await Hackathon.find({}).sort({ createdAt: -1 })
    .populate('organizerId', 'displayName email')
    .populate('pipelineId', 'name')
    .lean();
  const ids = hackathons.map((h) => h._id);
  const [teamCounts, subCounts, memberCounts] = await Promise.all([
    Team.aggregate([{ $match: { hackathonId: { $in: ids } } }, { $group: { _id: '$hackathonId', count: { $sum: 1 } } }]),
    Submission.aggregate([{ $match: { hackathonId: { $in: ids } } }, { $group: { _id: '$hackathonId', count: { $sum: 1 } } }]),
    Membership.aggregate([
      { $match: { hackathonId: { $in: ids }, status: 'ACTIVE' } },
      { $group: { _id: '$hackathonId', count: { $sum: 1 } } },
    ]),
  ]);
  const tMap = new Map(teamCounts.map((t) => [t._id.toString(), t.count]));
  const sMap = new Map(subCounts.map((t) => [t._id.toString(), t.count]));
  const mMap = new Map(memberCounts.map((t) => [t._id.toString(), t.count]));
  res.json({
    hackathons: hackathons.map((h) => ({
      ...h,
      teams: tMap.get(h._id.toString()) ?? 0,
      submissions: sMap.get(h._id.toString()) ?? 0,
      participants: mMap.get(h._id.toString()) ?? 0,
    })),
  });
}));

const hackathonSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/, 'slug: lowercase letters, digits, dashes').optional(),
  minTeamSize: z.number().int().min(1).max(20),
  maxTeamSize: z.number().int().min(1).max(20),
  formationOpensAt: dt,
  formationClosesAt: dt,
  submissionOpensAt: dt.optional(),
  submissionDeadline: dt.optional(),
  status: z.enum(['DRAFT', 'REGISTRATION_OPEN', 'FORMATION_OPEN', 'CLOSED', 'ARCHIVED']).optional(),
  leaderSuccessionPolicy: z.enum(['OPT_IN_THEN_DISBAN', 'ORGANIZER_FALLBACK']).optional(),
  pipelineId: oid.optional(),
}).refine((v) => v.maxTeamSize >= v.minTeamSize, { message: 'maxTeamSize must be >= minTeamSize' });

adminRouter.post('/hackathons', validate(hackathonSchema), asyncH(async (req, res) => {
  const b = req.body as z.infer<typeof hackathonSchema>;
  const slug = b.slug ?? slugify(b.name);
  const clash = await Hackathon.findOne({ slug }).lean();
  if (clash) throw badRequest(`Slug "${slug}" is already used`);
  if (b.pipelineId) {
    const pipe = await Pipeline.findById(b.pipelineId).select('_id').lean();
    if (!pipe) throw badRequest('Pipeline not found');
  }
  const hackathon = await Hackathon.create({
    ...b,
    slug,
    organizerId: req.userId,
    formationOpensAt: new Date(b.formationOpensAt),
    formationClosesAt: new Date(b.formationClosesAt),
    submissionOpensAt: b.submissionOpensAt ? new Date(b.submissionOpensAt) : undefined,
    submissionDeadline: b.submissionDeadline ? new Date(b.submissionDeadline) : undefined,
  });
  await AuditEvent.create({
    actorId: req.userId, eventType: 'HACKATHON_CREATED',
    metadata: { slug: hackathon.slug, name: hackathon.name },
  });
  res.status(201).json({ hackathon });
}));

const hackathonPatch = z.object({
  name: z.string().min(2).max(120).optional(),
  status: z.enum(['DRAFT', 'REGISTRATION_OPEN', 'FORMATION_OPEN', 'CLOSED', 'ARCHIVED']).optional(),
  minTeamSize: z.number().int().min(1).max(20).optional(),
  maxTeamSize: z.number().int().min(1).max(20).optional(),
  formationOpensAt: dt.optional(),
  formationClosesAt: dt.optional(),
  submissionOpensAt: dt.optional().nullable(),
  submissionDeadline: dt.optional().nullable(),
  leaderSuccessionPolicy: z.enum(['OPT_IN_THEN_DISBAN', 'ORGANIZER_FALLBACK']).optional(),
  pipelineId: oid.nullable().optional(),
});

adminRouter.patch('/hackathons/:id', validate(z.object({ id: oid }), 'params'), validate(hackathonPatch), asyncH(async (req, res) => {
  const existing = await Hackathon.findById(req.params.id).select('organizerId').lean();
  if (!existing) throw nf('Hackathon not found');
  // Events are owned by their creator — other organizers cannot edit them.
  if (existing.organizerId && existing.organizerId.toString() !== req.userId!.toString()) {
    throw forbidden('Only the owning organizer can edit this event');
  }
  const b = req.body as z.infer<typeof hackathonPatch>;
  if (b.pipelineId) {
    const pipe = await Pipeline.findById(b.pipelineId).select('_id').lean();
    if (!pipe) throw badRequest('Pipeline not found');
  }
  const $set: Record<string, unknown> = {};
  const dateFields = ['formationOpensAt', 'formationClosesAt', 'submissionOpensAt', 'submissionDeadline'] as const;
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined) continue;
    $set[k] = dateFields.includes(k as typeof dateFields[number])
      ? (v === null ? null : new Date(v as string))
      : v;
  }
  if (Object.keys($set).length === 0) throw badRequest('Nothing to update');
  // Backfill ownership on legacy events the first time they're edited.
  if (!existing.organizerId) $set.organizerId = req.userId;
  const hackathon = await Hackathon.findByIdAndUpdate(req.params.id, { $set }, { new: true }).lean();
  if (!hackathon) throw nf('Hackathon not found');
  await AuditEvent.create({
    actorId: req.userId, hackathonId: hackathon._id, eventType: 'HACKATHON_UPDATED',
    metadata: { fields: Object.keys($set) },
  });
  res.json({ hackathon });
}));

// ---------- Teams within a hackathon ----------

adminRouter.get('/hackathons/:id/teams', validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const hackathon = await Hackathon.findById(req.params.id).lean();
  if (!hackathon) throw nf('Hackathon not found');
  const teams = await Team.find({ hackathonId: hackathon._id })
    .sort({ createdAt: -1 }).limit(200).lean();
  const ids = teams.map((t) => t._id);
  const [members, pending, leaders] = await Promise.all([
    Membership.aggregate([
      { $match: { teamId: { $in: ids }, status: 'ACTIVE' } },
      { $group: { _id: '$teamId', count: { $sum: 1 } } },
    ]),
    JoinRequest.aggregate([
      { $match: { hackathonId: hackathon._id, status: 'PENDING' } },
      { $group: { _id: '$teamId', count: { $sum: 1 } } },
    ]),
    User.find({ _id: { $in: teams.map((t) => t.leaderId).filter(Boolean) } })
      .select('displayName').lean(),
  ]);
  const mMap = new Map(members.map((m) => [m._id.toString(), m.count]));
  const pMap = new Map(pending.map((m) => [m._id.toString(), m.count]));
  const lMap = new Map(leaders.map((u) => [u._id.toString(), u.displayName]));
  res.json({
    teams: teams.map((t) => ({
      _id: t._id, name: t.name, slug: t.slug, lifecycleStatus: t.lifecycleStatus,
      recruitmentStatus: t.recruitmentStatus, maxSize: t.maxSize,
      members: mMap.get(t._id.toString()) ?? 0,
      pendingRequests: pMap.get(t._id.toString()) ?? 0,
      leaderName: lMap.get(t.leaderId.toString()) ?? '— (leaderless)',
      leaderless: !lMap.has(t.leaderId.toString()),
      skillsSought: t.skillsSought,
    })),
  });
}));

// Members of a team — needed to pick an assignee for leadership.
adminRouter.get('/teams/:id/members', validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const members = await Membership.find({ teamId: req.params.id, status: 'ACTIVE' })
    .populate('participantId', 'displayName email')
    .sort({ joinedAt: 1 }).lean();
  res.json({
    members: members.map((m) => ({
      membershipId: m._id, role: m.role, openToLead: m.openToLead,
      user: m.participantId,
    })),
  });
}));

// ---------- Team intervention ----------

adminRouter.post('/teams/:id/assign-leader',
  validate(z.object({ id: oid }), 'params'),
  validate(z.object({ membershipId: oid })),
  asyncH(async (req, res) => {
    const { membershipId } = req.body as { membershipId: string };
    const membership = await Membership.findById(membershipId).lean();
    if (!membership || membership.teamId.toString() !== req.params.id || membership.status !== 'ACTIVE') {
      throw badRequest('Target must be an active member of this team');
    }
    await withTransaction(async (session) => {
      const team = await Team.findById(req.params.id).session(session);
      if (!team || team.lifecycleStatus !== 'ACTIVE') throw nf('Team not found or disbanded');
      await Membership.updateMany(
        { teamId: team._id, status: 'ACTIVE', role: 'LEADER', _id: { $ne: membership._id } },
        { $set: { role: 'MEMBER' } }, { session },
      );
      await Membership.updateOne(
        { _id: membership._id }, { $set: { role: 'LEADER' } }, { session },
      );
      team.leaderId = membership.participantId;
      if (team.recruitmentStatus === 'CLOSED' && team.memberCount < team.maxSize) {
        team.recruitmentStatus = 'OPEN';
      }
      team.version += 1;
      await team.save({ session });
      await AuditEvent.create([{
        teamId: team._id, hackathonId: team.hackathonId, actorId: req.userId,
        subjectId: membership.participantId, eventType: 'TEAM_LEADER_ASSIGNED',
        aggregateVersion: team.version, metadata: { membershipId },
      }], { session });
    });
    res.json({ ok: true });
  }));

adminRouter.post('/teams/:id/disband', validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const team = await Team.findById(req.params.id).lean();
  if (!team) throw nf('Team not found');
  if (team.lifecycleStatus === 'DISBANDED') throw badRequest('Team already disbanded');
  await withTransaction(async (session) => {
    await Team.updateOne(
      { _id: team._id },
      { $set: { lifecycleStatus: 'DISBANDED', recruitmentStatus: 'CLOSED' }, $inc: { version: 1 } },
      { session },
    );
    await Membership.updateMany(
      { teamId: team._id, status: 'ACTIVE' },
      { $set: { status: 'LEFT', leftAt: new Date() } }, { session },
    );
    await AuditEvent.create([{
      teamId: team._id, hackathonId: team.hackathonId, actorId: req.userId,
      eventType: 'TEAM_DISBANDED_BY_ORGANIZER', aggregateVersion: team.version + 1,
    }], { session });
  });
  res.json({ ok: true });
}));

// ---------- Organizer management ----------

adminRouter.get('/organizers', asyncH(async (_req, res) => {
  const organizers = await User.find({ isOrganizer: true })
    .select('displayName email createdAt').sort({ createdAt: 1 }).lean();
  res.json({ organizers });
}));

adminRouter.post('/organizers', validate(z.object({
  email: z.string().email().max(254),
  isOrganizer: z.boolean(),
})), asyncH(async (req, res) => {
  const { email, isOrganizer } = req.body as { email: string; isOrganizer: boolean };
  const user = await User.findOne({ email: email.toLowerCase() }).lean();
  if (!user) throw nf('No account with this email');
  if (!isOrganizer && user._id.toString() === req.userId!.toString()) {
    throw badRequest('You cannot revoke your own organizer role');
  }
  await User.updateOne({ _id: user._id }, { $set: { isOrganizer } });
  await AuditEvent.create({
    actorId: req.userId, subjectId: user._id,
    eventType: isOrganizer ? 'ORGANIZER_GRANTED' : 'ORGANIZER_REVOKED',
    metadata: { email: user.email },
  });
  res.json({ ok: true, email: user.email, isOrganizer });
}));

// ---------- Validation pipelines ----------

const stepBase = {
  stepId: z.string().min(1).max(64),
  enabled: z.boolean(),
  severity: z.enum(['reject', 'warn']),
};
const stepSchema = z.discriminatedUnion('type', [
  z.object({ ...stepBase, type: z.literal('file-size'), config: z.object({ maxMB: z.number().min(1).max(2048) }) }),
  z.object({ ...stepBase, type: z.literal('allowed-types'), config: z.object({ types: z.array(z.enum(['zip', 'pdf', 'image', 'text'])).min(1).max(4) }) }),
  z.object({ ...stepBase, type: z.literal('archive-scan'), config: z.object({
    maxEntries: z.number().int().min(1).max(1_000_000),
    maxRatio: z.number().min(1).max(100_000),
    maxUncompressedMB: z.number().min(0).max(100_000),
  }) }),
  z.object({ ...stepBase, type: z.literal('link-check'), config: z.record(z.string(), z.unknown()).optional() }),
  z.object({ ...stepBase, type: z.literal('readme-required'), config: z.record(z.string(), z.unknown()).optional() }),
]);

const pipelineSchema = z.object({
  name: z.string().min(2).max(80),
  steps: z.array(stepSchema).max(20),
});
const pipelinePatch = z.object({
  name: z.string().min(2).max(80).optional(),
  steps: z.array(stepSchema).max(20).optional(),
});

adminRouter.get('/pipelines', asyncH(async (req, res) => {
  const pipelines = await Pipeline.find({ ownerId: req.userId }).sort({ createdAt: -1 }).lean();
  // How many events use each pipeline — helps the organizer avoid breaking edits.
  const usage = await Hackathon.aggregate([
    { $match: { pipelineId: { $in: pipelines.map((p) => p._id) } } },
    { $group: { _id: '$pipelineId', count: { $sum: 1 } } },
  ]);
  const uMap = new Map(usage.map((u) => [u._id.toString(), u.count]));
  res.json({
    pipelines: pipelines.map((p) => ({
      ...p,
      stepCount: p.steps.length,
      usedBy: uMap.get(p._id.toString()) ?? 0,
      steps: undefined, // list view stays light; full steps come from GET /:id
    })),
  });
}));

adminRouter.get('/pipelines/:id', validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const pipeline = await Pipeline.findOne({ _id: req.params.id, ownerId: req.userId }).lean();
  if (!pipeline) throw nf('Pipeline not found');
  res.json({ pipeline });
}));

adminRouter.post('/pipelines', validate(pipelineSchema), asyncH(async (req, res) => {
  const b = req.body as z.infer<typeof pipelineSchema>;
  const pipeline = await Pipeline.create({ ...b, ownerId: req.userId });
  await AuditEvent.create({
    actorId: req.userId, eventType: 'PIPELINE_CREATED',
    metadata: { name: pipeline.name, steps: pipeline.steps.length },
  });
  res.status(201).json({ pipeline });
}));

adminRouter.patch('/pipelines/:id', validate(z.object({ id: oid }), 'params'), validate(pipelinePatch), asyncH(async (req, res) => {
  const b = req.body as z.infer<typeof pipelinePatch>;
  const pipeline = await Pipeline.findOneAndUpdate(
    { _id: req.params.id, ownerId: req.userId },
    { $set: b }, { new: true },
  ).lean();
  if (!pipeline) throw nf('Pipeline not found');
  await AuditEvent.create({
    actorId: req.userId, eventType: 'PIPELINE_UPDATED',
    metadata: { name: pipeline.name, fields: Object.keys(b) },
  });
  res.json({ pipeline });
}));

adminRouter.delete('/pipelines/:id', validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  // Detach from events first so nothing dangles, then delete.
  const pipeline = await Pipeline.findOne({ _id: req.params.id, ownerId: req.userId }).lean();
  if (!pipeline) throw nf('Pipeline not found');
  await Hackathon.updateMany({ pipelineId: pipeline._id }, { $unset: { pipelineId: 1 } });
  await Pipeline.deleteOne({ _id: pipeline._id });
  await AuditEvent.create({
    actorId: req.userId, eventType: 'PIPELINE_DELETED',
    metadata: { name: pipeline.name },
  });
  res.json({ ok: true });
}));
