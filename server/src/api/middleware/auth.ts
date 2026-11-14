import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { config } from '../../config.js';
import { unauthorized, forbidden } from '../../lib/errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: Types.ObjectId;
    isOrganizer?: boolean;
  }
}

export function signAccessToken(userId: Types.ObjectId, isOrganizer = false): string {
  return jwt.sign({ sub: userId.toString(), type: 'access', org: isOrganizer ? 1 : 0 }, config.jwtSecret, {
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
    const payload = jwt.verify(header.slice(7), config.jwtSecret) as { sub: string; type: string; org?: number };
    if (payload.type !== 'access') throw unauthorized('Invalid token type');
    // Stateless auth: the JWT is the credential. Skipping the per-request
    // User lookup removes one DB round-trip from every authenticated call —
    // matters under deadline-crush load. Trade-off: a deleted account's
    // access token stays valid until expiry (<= access TTL).
    req.userId = new Types.ObjectId(payload.sub);
    req.isOrganizer = payload.org === 1;
    next();
  } catch (err) {
    next(err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError ? unauthorized('Invalid or expired token') : err);
  }
}

export function requireOrganizer(req: Request, _res: Response, next: NextFunction): void {
  if (!req.isOrganizer) return next(forbidden('Organizer role required'));
  next();
}
