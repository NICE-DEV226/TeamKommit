import { OutboxEvent } from '../models/OutboxEvent.js';
import { publishEvent } from './sse.js';

/**
 * Outbox publisher: tails unpublished OutboxEvent docs and fans them out
 * to SSE clients. At-least-once delivery; clients dedupe by event id /
 * aggregateVersion. Runs in-process (monolith) — extracted to a worker
 * only if we scale horizontally (documented trade-off).
 */
export function startOutboxPublisher(intervalMs = 250): () => void {
  let stopped = false;
  let cursor: import('mongoose').Types.ObjectId | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      const filter: Record<string, unknown> = { publishedAt: null };
      if (cursor) filter._id = { $gt: cursor };
      const events = await OutboxEvent.find(filter).sort({ _id: 1 }).limit(200).lean();
      for (const ev of events) {
        publishEvent(ev as never);
        await OutboxEvent.updateOne({ _id: ev._id }, { $set: { publishedAt: new Date() } });
        cursor = ev._id;
      }
    } catch {
      // transient DB error — retry next tick
    }
    if (!stopped) setTimeout(tick, intervalMs);
  };

  void tick();
  return () => { stopped = true; };
}
