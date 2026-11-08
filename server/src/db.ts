import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDb(uri = config.mongoUri): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { autoIndex: true });
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}

/**
 * Run `fn` inside a MongoDB multi-document transaction.
 * Requires a replica set (docker-compose provides rs0).
 * Retries once on TransientTransactionError / UnknownTransactionCommitResult.
 */
export async function withTransaction<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let result!: T;
        await session.withTransaction(async () => {
          result = await fn(session);
        });
        return result;
      } catch (err) {
        lastErr = err;
        const e = err as { hasErrorLabel?: (l: string) => boolean };
        const retryable =
          e.hasErrorLabel?.('TransientTransactionError') ||
          e.hasErrorLabel?.('UnknownTransactionCommitResult');
        if (!retryable || attempt === 2) throw err;
      }
    }
    throw lastErr;
  } finally {
    await session.endSession();
  }
}
