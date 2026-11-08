import type { Response } from 'express';
import type { OutboxEventDoc } from '../models/OutboxEvent.js';

/**
 * SSE hub. The outbox publisher (realtime/publisher.ts) tails the
 * OutboxEvent collection and pushes committed events here; clients connect
 * to GET /api/events. Last-Event-ID replay is supported via event ids.
 */

interface Client {
  res: Response;
  hackathonId?: string;
  teamId?: string;
  lastId: number;
}

const clients = new Set<Client>();
let lastEventSeq = 0;

export function sseHeaders(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
}

export function addClient(res: Response, filters: { hackathonId?: string; teamId?: string }, lastId: number): Client {
  const client: Client = { res, hackathonId: filters.hackathonId, teamId: filters.teamId, lastId };
  clients.add(client);
  res.on('close', () => clients.delete(client));
  return client;
}

export function removeClient(res: Response): void {
  for (const c of clients) if (c.res === res) clients.delete(c);
}

/** Fan out a committed outbox event to matching subscribers. */
export function publishEvent(event: OutboxEventDoc): void {
  lastEventSeq += 1;
  const data = JSON.stringify({
    id: lastEventSeq,
    type: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId.toString(),
    version: event.aggregateVersion,
    payload: event.payload,
    at: event.createdAt,
  });
  for (const c of clients) {
    if (c.hackathonId && (event.payload as { hackathonId?: string }).hackathonId !== c.hackathonId) continue;
    if (c.teamId && event.aggregateId.toString() !== c.teamId) continue;
    try {
      c.res.write(`id: ${lastEventSeq}\nevent: ${event.eventType}\ndata: ${data}\n\n`);
    } catch {
      clients.delete(c);
    }
  }
}

export function clientCount(): number {
  return clients.size;
}
