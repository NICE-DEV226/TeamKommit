import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import rateLimit from 'express-rate-limit';
import { Hackathon } from '../../models/Hackathon.js';
import { Team } from '../../models/Team.js';
import { Membership } from '../../models/Membership.js';
import { User } from '../../models/User.js';
import { AuditEvent } from '../../models/AuditEvent.js';
import { validate } from '../middleware/common.js';
import { requireAuth } from '../middleware/auth.js';
import { createTeam, leaveTeam, createInviteCode } from '../../domain/teams.js';
import { canonicalSkills } from '../../domain/taxonomy.js';
import { suggestTeammates } from '../../domain/matching.js';
import { DomainRejection, forbidden, notFound as nf } from '../../lib/errors.js';
import { claimIdempotencyKey, finalizeIdempotencyKey } from '../../lib/idempotency.js';
import { withTransaction } from '../../db.js';

export const teamsRouter = Router();

const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

function asyncH(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => { fn(req, res, next).catch(next); };
}

// ---------- Hackathons ----------

teamsRouter.get('/hackathons', asyncH(async (_req, res) => {
  const hackathons = await Hackathon.find({ status: { $ne: 'ARCHIVED' } }).sort({ createdAt: -1 }).lean();
  res.json({ hackathons });
}));

teamsRouter.get('/hackathons/:id', validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const h = await Hackathon.findById(req.params.id).lean();
  if (!h) throw nf('Hackathon not found');
  res.json({ hackathon: h });
}));

// ---------- Board (PS1 must-have: live team board) ----------

const boardQuery = z.object({
  hackathonId: oid.optional(),
  skill: z.string().max(64).optional(),
  minPlaces: z.coerce.number().int().min(0).max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

teamsRouter.get('/board', validate(boardQuery, 'query'), asyncH(async (req, res) => {
  const q = req.query as unknown as z.infer<typeof boardQuery>;
  const hackathonId = q.hackathonId ?? (await Hackathon.findOne({ status: 'FORMATION_OPEN' }).sort({ createdAt: -1 }).select('_id').lean())?._id;
  if (!hackathonId) return res.json({ teams: [], page: 1, pageSize: q.pageSize, total: 0 });

  const filter: Record<string, unknown> = {
    hackathonId,
    lifecycleStatus: 'ACTIVE',
    recruitmentStatus: { $in: ['OPEN', 'PAUSED'] },
  };
  // Capacity is DERIVED (F-01): show teams with at least minPlaces free.
  if (q.minPlaces !== undefined) {
    filter.$expr = { $lt: [{ $add: ['$memberCount', q.minPlaces] }, '$maxSize'] };
  }
  if (q.skill) filter.skillsSought = q.skill;

  const BOARD_FIELDS = 'name slug description leaderId minSize maxSize memberCount lifecycleStatus recruitmentStatus skillsSought skillsHeld formationMessage createdAt updatedAt';
  const [teams, total] = await Promise.all([
    Team.find(filter)
      .select(BOARD_FIELDS)
      .sort({ memberCount: 1, _id: 1 }) // emptiest first = most relevant; _id = stable pagination
      .skip((q.page - 1) * q.pageSize)
      .limit(q.pageSize)
      .lean(),
    Team.countDocuments(filter),
  ]);

  // Attach leader display name (small N+1 acceptable at pageSize<=50; batch below)
  const leaderIds = [...new Set(teams.map((t) => t.leaderId.toString()))];
  const leaders = await User.find({ _id: { $in: leaderIds } }).select('displayName').lean();
  const nameMap = new Map(leaders.map((l) => [l._id.toString(), l.displayName]));

  res.json({
    teams: teams.map((t) => ({
      ...t,
      placesLeft: Math.max(0, t.maxSize - t.memberCount),
      leaderName: nameMap.get(t.leaderId.toString()) ?? 'Unknown',
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
  });
}));

// ---------- People board ----------

teamsRouter.get('/teams/people', validate(z.object({
  hackathonId: oid.optional(),
  q: z.string().max(80).optional(),
}), 'query'), asyncH(async (req, res) => {
  const { hackathonId, q } = req.query as unknown as { hackathonId?: string; q?: string };
  const hid = hackathonId ? new Types.ObjectId(hackathonId) : undefined;
  const busy = hid ? await Membership.distinct('participantId', { hackathonId: hid, status: 'ACTIVE' }) : [];
  const filter: Record<string, unknown> = {
    lookingForTeam: true,
    discoverable: true,
    ...(q ? { displayName: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {}),
    ...(busy.length ? { _id: { $nin: busy } } : {}),
  };
  const people = await User.find(filter).select('displayName bio timezone skills preferredRoles lookingForTeam updatedAt').limit(50).lean();
  res.json({ people });
}));

// ---------- Team CRUD ----------

const createTeamSchema = z.object({
  hackathonId: oid,
  name: z.string().min(2).max(80),
  description: z.string().max(2000).optional(),
  minSize: z.number().int().min(1).max(20).optional(),
  maxSize: z.number().int().min(1).max(20),
  skillsSought: z.array(z.string().min(1).max(64)).max(15).optional(),
  formationMessage: z.string().max(280).optional(),
  recruitmentStatus: z.enum(['OPEN', 'PAUSED', 'CLOSED']).optional(),
});

teamsRouter.post('/teams', requireAuth, validate(createTeamSchema), asyncH(async (req, res) => {
  const body = req.body as z.infer<typeof createTeamSchema>;
  const idemKey = req.headers['idempotency-key'] as string | undefined;
  let claim;
  if (idemKey) {
    claim = await claimIdempotencyKey('team.create', idemKey, { userId: req.userId!.toString(), ...body });
    if (claim.replay) return res.status(claim.replay.status).json(claim.replay.body);
    if (claim.inProgress) return res.status(409).json({ error: { code: 'REQUEST_IN_PROGRESS', message: 'Duplicate request in flight' } });
  }
  const result = await createTeam({
    hackathonId: new Types.ObjectId(body.hackathonId),
    creatorId: req.userId!,
    name: body.name,
    description: body.description,
    minSize: body.minSize,
    maxSize: body.maxSize,
    skillsSought: body.skillsSought,
    formationMessage: body.formationMessage,
    recruitmentStatus: body.recruitmentStatus,
    idempotency: claim,
  });
  if (!result.ok) {
    return res.status(result.status).json({ error: { code: result.code, message: result.message } });
  }
  res.status(201).json(result);
}));

teamsRouter.get('/teams/:id', validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const team = await Team.findById(req.params.id).lean();
  if (!team || team.lifecycleStatus !== 'ACTIVE') throw nf('Team not found');
  const members = await Membership.find({ teamId: team._id, status: 'ACTIVE' }).lean();
  const users = await User.find({ _id: { $in: members.map((m) => m.participantId) } })
    .select('displayName bio timezone skills preferredRoles').lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));
  const leader = await User.findById(team.leaderId).select('displayName').lean();
  res.json({
    team: { ...team, placesLeft: Math.max(0, team.maxSize - team.memberCount), leaderName: leader?.displayName },
    members: members.map((m) => ({
      membershipId: m._id,
      role: m.role,
      joinedAt: m.joinedAt,
      openToLead: m.openToLead,
      user: userMap.get(m.participantId.toString()),
    })),
  });
}));

const patchTeamSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(2000).optional(),
  recruitmentStatus: z.enum(['OPEN', 'PAUSED', 'CLOSED']).optional(),
  skillsSought: z.array(z.string().min(1).max(64)).max(15).optional(),
  formationMessage: z.string().max(280).optional(),
  maxSize: z.number().int().min(1).max(20).optional(),
});

teamsRouter.patch('/teams/:id', requireAuth, validate(z.object({ id: oid }), 'params'), validate(patchTeamSchema), asyncH(async (req, res) => {
  const team = await Team.findById(req.params.id);
  if (!team || team.lifecycleStatus !== 'ACTIVE') throw nf('Team not found');
  if (team.leaderId.toString() !== req.userId!.toString()) throw forbidden('Only the leader can update the team');
  const body = req.body as z.infer<typeof patchTeamSchema>;
  if (body.skillsSought) body.skillsSought = canonicalSkills(body.skillsSought);
  if (body.maxSize !== undefined) {
    if (body.maxSize < team.memberCount) throw new DomainRejection('MAX_SIZE_BELOW_MEMBERS', 'maxSize cannot be below current member count', 422);
    const hack = await Hackathon.findById(team.hackathonId).lean();
    if (hack && body.maxSize > hack.maxTeamSize) throw new DomainRejection('INVALID_TEAM_SIZE', 'Exceeds hackathon max team size', 422);
  }
  Object.assign(team, body, { version: team.version + 1 });
  await team.save();
  res.json({ team });
}));

teamsRouter.post('/teams/:id/leave', requireAuth, validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const team = await Team.findById(req.params.id).lean();
  if (!team) throw nf('Team not found');
  const result = await leaveTeam({
    hackathonId: team.hackathonId as Types.ObjectId,
    teamId: team._id as Types.ObjectId,
    participantId: req.userId!,
    actorId: req.userId!,
  });
  res.json(result);
}));

teamsRouter.post('/teams/:id/invite-code', requireAuth, validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const team = await Team.findById(req.params.id).lean();
  if (!team) throw nf('Team not found');
  const result = await createInviteCode({
    teamId: team._id as Types.ObjectId,
    hackathonId: team.hackathonId as Types.ObjectId,
    actorId: req.userId!,
  });
  res.status(201).json(result);
}));

// Member opts in/out of leadership succession (OPT_IN_THEN_DISBAN policy).
// Without this, the succession engine's openToLead flag is unreachable.
const leadOptInSchema = z.object({ open: z.boolean() });
teamsRouter.post('/teams/:id/lead-opt-in', requireAuth, validate(z.object({ id: oid }), 'params'), validate(leadOptInSchema), asyncH(async (req, res) => {
  const team = await Team.findById(req.params.id).lean();
  if (!team || team.lifecycleStatus !== 'ACTIVE') throw nf('Team not found');
  const { open } = req.body as z.infer<typeof leadOptInSchema>;
  const m = await Membership.findOneAndUpdate(
    { teamId: team._id, participantId: req.userId, status: 'ACTIVE' },
    { $set: { openToLead: open } },
    { new: true },
  ).lean();
  if (!m) throw forbidden('Only active team members can opt in to leadership');
  res.json({ openToLead: m.openToLead });
}));

// Leader removes a member (policy: leaders can remove; audited).
const removeSchema = z.object({ membershipId: oid });
teamsRouter.post('/teams/:id/remove', requireAuth, validate(z.object({ id: oid }), 'params'), validate(removeSchema), asyncH(async (req, res) => {
  const team = await Team.findById(req.params.id);
  if (!team || team.lifecycleStatus !== 'ACTIVE') throw nf('Team not found');
  if (team.leaderId.toString() !== req.userId!.toString()) throw forbidden('Only the leader can remove members');
  const { membershipId } = req.body as z.infer<typeof removeSchema>;

  await withTransaction(async (session) => {
    const m = await Membership.findOneAndUpdate(
      { _id: membershipId, teamId: team._id, status: 'ACTIVE', role: 'MEMBER' },
      { $set: { status: 'REMOVED', leftAt: new Date() } },
      { session },
    );
    if (!m) throw new DomainRejection('NOT_FOUND', 'Active member not found', 404);
    await Team.updateOne({ _id: team._id }, { $inc: { memberCount: -1, version: 1 } }, { session });
    await AuditEvent.create([{
      hackathonId: team.hackathonId, teamId: team._id,
      actorId: req.userId, subjectId: m.participantId,
      eventType: 'TEAM_MEMBER_REMOVED', aggregateVersion: team.version + 1,
      occurredAt: new Date(),
    }], { session });
    await import('../../models/OutboxEvent.js').then(({ OutboxEvent }) => OutboxEvent.create([{
      aggregateType: 'team', aggregateId: team._id, aggregateVersion: team.version + 1,
      eventType: 'team.member.removed',
      payload: { teamId: team._id.toString(), participantId: m.participantId.toString(), memberCount: team.memberCount - 1 },
    }], { session }));
  });
  res.json({ ok: true });
}));

// ---------- Suggestions (scoring must-have) ----------

teamsRouter.get('/teams/:id/suggestions', requireAuth, validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const team = await Team.findById(req.params.id).lean();
  if (!team) throw nf('Team not found');
  const isMember = await Membership.exists({ teamId: team._id, participantId: req.userId, status: 'ACTIVE' });
  if (!isMember) throw forbidden('Only team members can see suggestions');
  const suggestions = await suggestTeammates(team._id as Types.ObjectId, team.hackathonId as Types.ObjectId);
  res.json({ suggestions });
}));

// ---------- Audit log ----------

teamsRouter.get('/teams/:id/audit', requireAuth, validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const team = await Team.findById(req.params.id).lean();
  if (!team) throw nf('Team not found');
  const isMember = await Membership.exists({ teamId: team._id, participantId: req.userId, status: 'ACTIVE' });
  const isLeader = team.leaderId.toString() === req.userId!.toString();
  if (!isMember && !isLeader && !req.isOrganizer) throw forbidden();
  const events = await AuditEvent.find({ teamId: team._id }).sort({ occurredAt: -1 }).limit(100).lean();
  res.json({ events });
}));
