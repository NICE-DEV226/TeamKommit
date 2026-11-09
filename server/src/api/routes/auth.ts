import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Types } from 'mongoose';
import { User } from '../../models/User.js';
import { validate } from '../middleware/common.js';
import { requireAuth, signAccessToken, signRefreshToken } from '../middleware/auth.js';
import { badRequest, unauthorized } from '../../lib/errors.js';
import { canonicalSkill, canonicalSkills } from '../../domain/taxonomy.js';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import rateLimit from 'express-rate-limit';

export const authRouter = Router();

const credentialsLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, slow down' } },
});

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

function tokensFor(userId: Types.ObjectId) {
  return {
    accessToken: signAccessToken(userId),
    refreshToken: signRefreshToken(userId),
  };
}

authRouter.post('/register', credentialsLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body as z.infer<typeof registerSchema>;
    const exists = await User.findOne({ email: email.toLowerCase() }).lean();
    if (exists) throw badRequest('An account with this email already exists');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email: email.toLowerCase(), passwordHash, displayName });
    res.status(201).json({ user: publicUser(user), ...tokensFor(user._id as Types.ObjectId) });
  } catch (err) { next(err); }
});

authRouter.post('/login', credentialsLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw unauthorized('Invalid email or password');
    }
    res.json({ user: publicUser(user), ...tokensFor(user._id as Types.ObjectId) });
  } catch (err) { next(err); }
});

authRouter.post('/refresh', credentialsLimiter, async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) throw unauthorized('Missing refresh token');
    const payload = jwt.verify(refreshToken, config.jwtSecret) as { sub: string; type: string };
    if (payload.type !== 'refresh') throw unauthorized('Invalid token type');
    res.json(tokensFor(new Types.ObjectId(payload.sub)));
  } catch (err) { next(err instanceof jwt.JsonWebTokenError ? unauthorized('Invalid refresh token') : err); }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).lean();
    if (!user) throw unauthorized();
    res.json({ user: publicUser(user) });
  } catch (err) { next(err); }
});

const profileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  bio: z.string().max(500).optional(),
  timezone: z.string().max(64).optional(),
  skills: z.array(z.object({
    skill: z.string().min(1).max(64),
    level: z.number().min(0).max(1),
    canLead: z.boolean().optional(),
  })).max(30).optional(),
  preferredRoles: z.array(z.string().max(64)).max(10).optional(),
  availability: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    startMin: z.number().int().min(0).max(1439),
    endMin: z.number().int().min(0).max(1439),
  })).max(50).optional(),
  lookingForTeam: z.boolean().optional(),
  discoverable: z.boolean().optional(),
});

authRouter.patch('/me', requireAuth, validate(profileSchema), async (req, res, next) => {
  try {
    // Canonicalize skills/roles on write — matching math depends on identity.
    const update = { ...(req.body as Record<string, unknown>) };
    if (Array.isArray(update.skills)) {
      update.skills = (update.skills as { skill: string; level: number; canLead?: boolean }[])
        .map((s) => ({ ...s, skill: canonicalSkill(s.skill) }))
        .filter((s) => s.skill !== '');
    }
    if (Array.isArray(update.preferredRoles)) {
      update.preferredRoles = canonicalSkills(update.preferredRoles as string[]);
    }
    const user = await User.findByIdAndUpdate(req.userId, { $set: update }, { new: true }).lean();
    res.json({ user: publicUser(user!) });
  } catch (err) { next(err); }
});

function publicUser(u: object) {
  const doc = typeof (u as { toObject?: () => object }).toObject === 'function'
    ? (u as { toObject: () => object }).toObject()
    : u;
  const { passwordHash, refreshTokenHash, ...rest } = doc as Record<string, unknown> & { passwordHash?: string; refreshTokenHash?: string };
  return rest;
}
