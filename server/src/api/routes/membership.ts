import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import rateLimit from 'express-rate-limit';
import { Team } from '../../models/Team.js';
import { Membership } from '../../models/Membership.js';
import { User } from '../../models/User.js';
import { Invitation, hashInviteCode } from '../../models/Invitation.js';
import { JoinRequest } from '../../models/JoinRequest.js';
import { validate } from '../middleware/common.js';
import { requireAuth } from '../middleware/auth.js';
import { admit } from '../../domain/admission.js';
import { config } from '../../config.js';
import { DomainRejection, forbidden, notFound as nf } from '../../lib/errors.js';

export const membershipRouter = Router();
const oid = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

function asyncH(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => { fn(req, res, next).catch(next); };
}

// Invite codes get their own tight limiter — brute-force defense.
const codeLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.invite.maxAttemptsPerHour / 3, // ~7/min sustained
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many code attempts' } },
});

function sendAdmitResult(res: Response, result: Awaited<ReturnType<typeof admit>>) {
  if (!result.ok) {
    return res.status(result.status).json({ error: { code: result.code, message: result.message } });
  }
  res.json({ membershipId: result.membershipId, teamId: result.teamId, memberCount: result.memberCount });
}

// ---------- Direct invitations (leader → known user) ----------

const inviteSchema = z.object({ inviteeId: oid });
membershipRouter.post('/teams/:id/invitations', requireAuth, codeLimiter, validate(z.object({ id: oid }), 'params'), validate(inviteSchema), asyncH(async (req, res) => {
  const team = await Team.findById(req.params.id).lean();
  if (!team || team.lifecycleStatus !== 'ACTIVE') throw nf('Team not found');
  if (team.leaderId.toString() !== req.userId!.toString()) throw forbidden('Only the leader can invite');
  const { inviteeId } = req.body as z.infer<typeof inviteSchema>;
  const invitee = await User.findById(inviteeId).select('_id').lean();
  if (!invitee) throw nf('User not found');
  if (await Membership.exists({ hackathonId: team.hackathonId, participantId: inviteeId, status: 'ACTIVE' })) {
    throw new DomainRejection('ALREADY_IN_TEAM', 'That user is already on a team', 409);
  }
  const expiresAt = new Date(Date.now() + config.invite.ttlHours * 3600_000);
  const inv = await Invitation.create({
    hackathonId: team.hackathonId, teamId: team._id, inviterId: req.userId,
    inviteeId: new Types.ObjectId(inviteeId), kind: 'DIRECT', status: 'PENDING', expiresAt,
  });
  res.status(201).json({ invitation: inv });
}));

membershipRouter.get('/invitations', requireAuth, asyncH(async (req, res) => {
  const invites = await Invitation.find({ inviteeId: req.userId, status: 'PENDING', expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 }).limit(50).lean();
  const teamIds = invites.map((i) => i.teamId);
  const teams = await Team.find({ _id: { $in: teamIds } }).select('name slug memberCount maxSize').lean();
  const tmap = new Map(teams.map((t) => [t._id.toString(), t]));
  res.json({ invitations: invites.map((i) => ({ ...i, team: tmap.get(i.teamId.toString()) })) });
}));

membershipRouter.post('/invitations/:id/accept', requireAuth, codeLimiter, validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const inv = await Invitation.findById(req.params.id).lean();
  if (!inv || inv.status !== 'PENDING' || inv.expiresAt <= new Date()) throw nf('Invitation not found or expired');
  if (inv.inviteeId && inv.inviteeId.toString() !== req.userId!.toString()) throw forbidden('This invitation is addressed to someone else');
  const idemKey = req.headers['idempotency-key'] as string | undefined;
  const result = await admit({
    hackathonId: inv.hackathonId as Types.ObjectId,
    teamId: inv.teamId as Types.ObjectId,
    participantId: req.userId!,
    source: 'INVITATION',
    actorId: req.userId!,
    invitationId: inv._id as Types.ObjectId,
    idempotencyKey: idemKey,
  });
  sendAdmitResult(res, result);
}));

membershipRouter.post('/invitations/:id/decline', requireAuth, validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const inv = await Invitation.findById(req.params.id);
  if (!inv || inv.status !== 'PENDING') throw nf('Invitation not found');
  if (inv.inviteeId && inv.inviteeId.toString() !== req.userId!.toString()) throw forbidden();
  inv.status = 'DECLINED';
  inv.decidedAt = new Date();
  await inv.save();
  res.json({ ok: true });
}));

// ---------- Invite codes (shareable, high entropy, rate-limited) ----------

const joinCodeSchema = z.object({ code: z.string().min(10).max(64) });
membershipRouter.post('/teams/join-code', requireAuth, codeLimiter, validate(joinCodeSchema), asyncH(async (req, res) => {
  const { code } = req.body as z.infer<typeof joinCodeSchema>;
  // Hash lookup only — raw codes are never stored. 128-bit entropy makes
  // guessing infeasible; the rate limiter caps attempts per IP/user.
  const inv = await Invitation.findOne({
    codeHash: hashInviteCode(code.trim()),
    kind: 'CODE',
    status: 'PENDING',
    expiresAt: { $gt: new Date() },
  }).lean();
  // Same response whether the code exists or not → no oracle.
  if (!inv) throw new DomainRejection('INVALID_CODE', 'Invalid or expired invite code', 404);
  const idemKey = req.headers['idempotency-key'] as string | undefined;
  const result = await admit({
    hackathonId: inv.hackathonId as Types.ObjectId,
    teamId: inv.teamId as Types.ObjectId,
    participantId: req.userId!,
    source: 'INVITE_CODE',
    actorId: req.userId!,
    invitationId: inv._id as Types.ObjectId,
    idempotencyKey: idemKey,
  });
  sendAdmitResult(res, result);
}));

// ---------- Join requests (participant → team, leader decides) ----------

const requestSchema = z.object({ message: z.string().max(500).optional() });
membershipRouter.post('/teams/:id/join-request', requireAuth, validate(z.object({ id: oid }), 'params'), validate(requestSchema), asyncH(async (req, res) => {
  const team = await Team.findById(req.params.id).lean();
  if (!team || team.lifecycleStatus !== 'ACTIVE') throw nf('Team not found');
  const now = new Date();
  const hack = await import('../../models/Hackathon.js').then((m) => m.Hackathon.findById(team.hackathonId).lean());
  if (!hack || hack.status !== 'FORMATION_OPEN' || now < hack.formationOpensAt || now > hack.formationClosesAt) {
    throw new DomainRejection('FORMATION_CLOSED', 'Team formation is closed', 409);
  }
  if (team.recruitmentStatus !== 'OPEN') throw new DomainRejection('RECRUITMENT_CLOSED', 'This team is not recruiting', 409);
  if (team.memberCount >= team.maxSize) throw new DomainRejection('TEAM_FULL', 'This team is full', 409);
  if (await Membership.exists({ hackathonId: team.hackathonId, participantId: req.userId, status: 'ACTIVE' })) {
    throw new DomainRejection('ALREADY_IN_TEAM', 'You already belong to a team', 409);
  }
  const { message } = req.body as z.infer<typeof requestSchema>;
  try {
    const jr = await JoinRequest.create({
      hackathonId: team.hackathonId, teamId: team._id, participantId: req.userId,
      message: message ?? '', status: 'PENDING',
    });
    res.status(201).json({ joinRequest: jr });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new DomainRejection('REQUEST_EXISTS', 'You already have a pending request to this team', 409);
    }
    throw err;
  }
}));

membershipRouter.post('/teams/:id/join-request/cancel', requireAuth, validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const team = await Team.findById(req.params.id).lean();
  if (!team) throw nf('Team not found');
  const jr = await JoinRequest.findOneAndUpdate(
    { teamId: team._id, participantId: req.userId, status: 'PENDING' },
    { $set: { status: 'CANCELLED' } },
    { new: true },
  );
  if (!jr) throw nf('No pending request');
  res.json({ ok: true });
}));

membershipRouter.get('/teams/:id/requests', requireAuth, validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  const team = await Team.findById(req.params.id).lean();
  if (!team) throw nf('Team not found');
  if (team.leaderId.toString() !== req.userId!.toString()) throw forbidden('Only the leader can view requests');
  const requests = await JoinRequest.find({ teamId: team._id, status: 'PENDING' }).sort({ createdAt: 1 }).limit(100).lean();
  const users = await User.find({ _id: { $in: requests.map((r) => r.participantId) } })
    .select('displayName bio timezone skills').lean();
  const umap = new Map(users.map((u) => [u._id.toString(), u]));
  res.json({ requests: requests.map((r) => ({ ...r, user: umap.get(r.participantId.toString()) })) });
}));

async function decideRequest(req: Request, res: Response, decision: 'ACCEPTED' | 'DECLINED') {
  const jr = await JoinRequest.findById(req.params.id);
  if (!jr || jr.status !== 'PENDING') throw nf('Request not found or already decided');
  const team = await Team.findById(jr.teamId).lean();
  if (!team) throw nf('Team not found');
  if (team.leaderId.toString() !== req.userId!.toString()) throw forbidden('Only the leader can decide requests');

  if (decision === 'DECLINED') {
    jr.status = 'DECLINED';
    jr.decidedBy = req.userId ?? null;
    jr.decidedAt = new Date();
    await jr.save();
    return res.json({ ok: true });
  }

  const idemKey = req.headers['idempotency-key'] as string | undefined;
  const result = await admit({
    hackathonId: jr.hackathonId as Types.ObjectId,
    teamId: jr.teamId as Types.ObjectId,
    participantId: jr.participantId as Types.ObjectId,
    source: 'JOIN_REQUEST',
    actorId: req.userId!,
    joinRequestId: jr._id as Types.ObjectId,
    idempotencyKey: idemKey,
  });
  sendAdmitResult(res, result);
}

membershipRouter.post('/requests/:id/accept', requireAuth, validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  await decideRequest(req, res, 'ACCEPTED');
}));
membershipRouter.post('/requests/:id/decline', requireAuth, validate(z.object({ id: oid }), 'params'), asyncH(async (req, res) => {
  await decideRequest(req, res, 'DECLINED');
}));

// ---------- My teams / membership state ----------

membershipRouter.get('/me/teams', requireAuth, asyncH(async (req, res) => {
  const memberships = await Membership.find({ participantId: req.userId, status: 'ACTIVE' }).lean();
  const teamIds = memberships.map((m) => m.teamId);
  const teams = await Team.find({ _id: { $in: teamIds } }).lean();
  res.json({
    memberships: memberships.map((m) => ({
      ...m,
      team: teams.find((t) => t._id.toString() === m.teamId.toString()),
    })),
  });
}));


