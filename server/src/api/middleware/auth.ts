import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { config } from '../../config.js';
import { User } from '../../models/User.js';
import { unauthorized, forbidden } from '../../lib/errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: Types.ObjectId;
    isOrganizer?: boolean;
  }
}

export function signAccessToken(userId: Types.ObjectId): string {
  return jwt.sign({ sub: userId.toString(), type: 'access' }, config.jwtSecret, {
    expiresIn: config.jwtAccessTtlSec,
  });
}

export function signRefreshToken(userId: Types.ObjectId): string {
  return jwt.sign({ sub: userId.toString(), type: 'refresh' }, config.jwtSecret, {
    expiresIn: config.jwtRefreshTtlSec,
  });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as { sub: string; type: string };
    if (payload.type !== 'access') throw unauthorized('Invalid token type');
    const user = await User.findById(payload.sub).select('_id isOrganizer').lean();
    if (!user) throw unauthorized('Account not found');
    req.userId = user._id as Types.ObjectId;
    req.isOrganizer = user.isOrganizer;
    next();
  } catch (err) {
    next(err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError ? unauthorized('Invalid or expired token') : err);
  }
}

export function requireOrganizer(req: Request, _res: Response, next: NextFunction): void {
  if (!req.isOrganizer) return next(forbidden('Organizer role required'));
  next();
}
