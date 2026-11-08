import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { AppError, badRequest } from '../../lib/errors.js';

/** Validate request parts against a zod schema; attaches parsed values. */
export function validate<T extends ZodSchema>(schema: T, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[source]);
      if (source === 'body') req.body = parsed;
      else (req as unknown as Record<string, unknown>)[source] = parsed;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Central error handler — maps AppError/ZodError to JSON, never leaks internals. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid input', issues: err.issues } });
    return;
  }
  const e = err as { code?: number; message?: string };
  if (e?.code === 11000) {
    res.status(409).json({ error: { code: 'DUPLICATE', message: 'Resource already exists' } });
    return;
  }
  console.error('[api] unhandled error', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

export { badRequest };
