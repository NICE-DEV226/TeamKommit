import { Types, type ClientSession } from 'mongoose';
import { IdempotencyKey, hashRequest } from '../models/IdempotencyKey.js';
import { DomainRejection } from './errors.js';

const LOCK_MS = 30_000;
const TTL_MS = 24 * 3600_000;

export interface IdempotencyClaim {
  id: Types.ObjectId;
  /** Replay a stored terminal result instead of executing. */
  replay?: { status: number; body: unknown };
  /** Another request holds a fresh lock — caller should return 409. */
  inProgress?: boolean;
}

/**
 * Claim an idempotency key BEFORE the business transaction.
 * - same key + same payload + terminal state → replay stored result
 * - same key + different payload → DomainRejection(IDEMPOTENCY_KEY_MISUSE)
 * - fresh PROCESSING lock held by someone else → inProgress
 * - stale PROCESSING (crashed worker) → reclaimed and re-executed
 */
export async function claimIdempotencyKey(
  scope: string,
  key: string,
  payload: unknown,
): Promise<IdempotencyClaim> {
  const requestHash = hashRequest(payload);
  const now = new Date();

  const existing = await IdempotencyKey.findOne({ scope, key }).lean();
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new DomainRejection('IDEMPOTENCY_KEY_MISUSE', 'Idempotency-Key was already used with a different request', 422);
    }
    if (existing.status === 'SUCCEEDED' || existing.status === 'REJECTED') {
      return { id: existing._id, replay: { status: existing.httpStatus ?? 200, body: existing.result } };
    }
    if (existing.lockedUntil && existing.lockedUntil > now) {
      return { id: existing._id, inProgress: true };
    }
    // Stale PROCESSING → reclaim
    await IdempotencyKey.updateOne(
      { _id: existing._id, status: 'PROCESSING' },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
    );
    return { id: existing._id };
  }

  try {
    const doc = await IdempotencyKey.create({
      scope,
      key,
      requestHash,
      status: 'PROCESSING',
      lockedUntil: new Date(now.getTime() + LOCK_MS),
      expiresAt: new Date(now.getTime() + TTL_MS),
    });
    return { id: doc._id };
  } catch (err) {
    // Concurrent insert lost the race → re-read and apply the same rules.
    if ((err as { code?: number }).code === 11000) {
      return claimIdempotencyKey(scope, key, payload);
    }
    throw err;
  }
}

/**
 * Finalize the idempotency record INSIDE the business transaction so the
 * result and the business writes commit or abort together.
 */
export async function finalizeIdempotencyKey(
  session: ClientSession | undefined,
  claim: IdempotencyClaim,
  outcome: { ok: true; status: number; body: unknown } | { ok: false; status: number; body: unknown },
): Promise<void> {
  await IdempotencyKey.updateOne(
    { _id: claim.id },
    {
      $set: {
        status: outcome.ok ? 'SUCCEEDED' : 'REJECTED',
        httpStatus: outcome.status,
        result: outcome.body,
        lockedUntil: null,
      },
    },
    session ? { session } : {},
  );
}
