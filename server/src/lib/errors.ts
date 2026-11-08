export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Forbidden') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Not found') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (code: string, msg: string, details?: unknown) => new AppError(409, code, msg, details);
export const tooMany = (msg = 'Too many requests') => new AppError(429, 'RATE_LIMITED', msg);
export const unprocessable = (code: string, msg: string) => new AppError(422, code, msg);

/** Business rejections that MUST be persisted as idempotent terminal results. */
export class DomainRejection extends AppError {
  constructor(
    code: string,
    message: string,
    public httpStatus = 409,
  ) {
    super(httpStatus, code, message);
    this.name = 'DomainRejection';
  }
}
