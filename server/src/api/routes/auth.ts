import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Types } from 'mongoose';
import { User } from '../../models/User.js';
import { validate } from '../middleware/common.js';
import { requireAuth, signAccessToken, signRefreshToken } from '../middleware/auth.js';
import { badRequest, unauthorized } from '../../lib/errors.js';
import { canonicalSkill, canonicalSkills } from '../../domain/taxonomy.js';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { sendMailAsync, welcomeEmail, verificationEmail, passwordResetEmail } from '../../mail.js';
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

function newEmailToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: createHash('sha256').update(raw).digest('hex') };
}

const verifyUrl = (raw: string) => `${config.mail.appUrl}/verify-email?token=${raw}`;
const resetUrl = (raw: string) => `${config.mail.appUrl}/reset-password?token=${raw}`;

authRouter.post('/register', credentialsLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body as z.infer<typeof registerSchema>;
    const exists = await User.findOne({ email: email.toLowerCase() }).lean();
    if (exists) throw badRequest('An account with this email already exists');
    const passwordHash = await bcrypt.hash(password, 12);
    const { raw, hash } = newEmailToken();
    const user = await User.create({
      email: email.toLowerCase(), passwordHash, displayName,
      verifyTokenHash: hash,
      verifyTokenExpires: new Date(Date.now() + config.mail.verifyTtlHours * 3600_000),
    });
    sendMailAsync(welcomeEmail({ email: user.email, name: displayName }, displayName, verifyUrl(raw)));
    res.status(201).json({ user: publicUser(user), ...tokensFor(user._id as Types.ObjectId) });
  } catch (err) { next(err); }
});

authRouter.post('/verify-email', credentialsLimiter, async (req, res, next) => {
  try {
    const { token } = req.body as { token?: string };
    if (!token || typeof token !== 'string') throw badRequest('Missing token');
    const hash = createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      verifyTokenHash: hash,
      verifyTokenExpires: { $gt: new Date() },
    });
    if (!user) throw badRequest('This verification link is invalid or has expired');
    user.emailVerified = true;
    user.verifyTokenHash = undefined;
    user.verifyTokenExpires = undefined;
    await user.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

authRouter.post('/resend-verification', requireAuth, credentialsLimiter, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) throw unauthorized();
    if (user.emailVerified) throw badRequest('Email already verified');
    const { raw, hash } = newEmailToken();
    user.verifyTokenHash = hash;
    user.verifyTokenExpires = new Date(Date.now() + config.mail.verifyTtlHours * 3600_000);
    await user.save();
    sendMailAsync(verificationEmail({ email: user.email, name: user.displayName }, verifyUrl(raw)));
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Always 200 — never reveal whether the email exists.
authRouter.post('/forgot-password', credentialsLimiter, async (req, res, next) => {
  try {
    const { email } = req.body as { email?: string };
    if (email && typeof email === 'string') {
      const user = await User.findOne({ email: email.toLowerCase().trim() });
      if (user) {
        const { raw, hash } = newEmailToken();
        user.resetTokenHash = hash;
        user.resetTokenExpires = new Date(Date.now() + config.mail.resetTtlMin * 60_000);
        await user.save();
        sendMailAsync(passwordResetEmail({ email: user.email, name: user.displayName }, resetUrl(raw)));
      }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

authRouter.post('/reset-password', credentialsLimiter, async (req, res, next) => {
  try {
    const { token, password } = req.body as { token?: string; password?: string };
    if (!token || typeof token !== 'string') throw badRequest('Missing token');
    if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      throw badRequest('Password must be 8-128 characters');
    }
    const hash = createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetTokenHash: hash,
      resetTokenExpires: { $gt: new Date() },
    });
    if (!user) throw badRequest('This reset link is invalid or has expired');
    user.passwordHash = await bcrypt.hash(password, 12);
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    user.emailVerified = true; // proves mailbox ownership
    user.refreshTokenHash = undefined; // revoke all sessions
    await user.save();
    res.json({ ok: true });
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

function profileCompleteness(u: Record<string, unknown>): number {
  // Weighted rubric — every field that feeds matching/explainability.
  let score = 0;
  const skills = Array.isArray(u.skills) ? u.skills.length : 0;
  if (skills > 0) score += 30;
  if (skills >= 3) score += 10;
  const avail = Array.isArray(u.availability) ? u.availability.length : 0;
  if (avail > 0) score += 25;
  if (typeof u.bio === 'string' && u.bio.trim().length >= 20) score += 15;
  if (u.timezone && u.timezone !== 'UTC') score += 10;
  if (u.lookingForTeam === true) score += 10;
  if (Array.isArray(u.preferredRoles) && u.preferredRoles.length > 0) score += 10;
  return Math.min(100, score);
}

function publicUser(u: object) {
  const doc = typeof (u as { toObject?: () => object }).toObject === 'function'
    ? (u as { toObject: () => object }).toObject()
    : u;
  const { passwordHash, refreshTokenHash, verifyTokenHash, verifyTokenExpires, resetTokenHash, resetTokenExpires, ...rest } =
    doc as Record<string, unknown> & { passwordHash?: string; refreshTokenHash?: string };
  return { ...rest, profileCompleteness: profileCompleteness(rest) };
}
