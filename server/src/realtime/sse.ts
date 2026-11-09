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
  /** Authorization scope resolved once at connect time (see events.ts). */
  memberTeamIds: Set<string>;
  isOrganizer: boolean;
  lastId: number;
}

/** The authorization-relevant slice of a client — shared by live fan-out
 * and Last-Event-ID replay so both apply identical rules. */
export interface SubscriberScope {
  hackathonId?: string;
  teamId?: string;
  memberTeamIds: Set<string>;
  isOrganizer: boolean;
}

const clients = new Set<Client>();

export function sseHeaders(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
}

/** Format an outbox event as an SSE frame. Event id = outbox _id (ObjectId
 * hex is timestamp-ordered) → stable across restarts and replayable. */
export function formatSseEvent(event: OutboxEventDoc): string {
  const data = JSON.stringify({
    id: event._id.toString(),
    type: event.eventType,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId.toString(),
    version: event.aggregateVersion,
    payload: event.payload,
    at: event.createdAt,
  });
  return `id: ${event._id.toString()}\nevent: ${event.eventType}\ndata: ${data}\n\n`;
}

/**
 * May this subscriber see this event? Two layers:
 *  1. Requested filters (hackathon/team) — always applied.
 *  2. Event sensitivity — `submission.*` events carry status + check errors
 *     and are private to team members and organizers; `team.*` events only
 *     expose data already public on the board, so any authenticated user
 *     inside the hackathon scope may receive them.
 * Note: membership is resolved at connect time; a member who leaves keeps
 * the stream until reconnect — acceptable for a short-lived access token.
 */
export function clientMaySee(scope: SubscriberScope, event: OutboxEventDoc): boolean {
  const payload = event.payload as { hackathonId?: string; teamId?: string };
  if (scope.hackathonId && payload.hackathonId !== scope.hackathonId) return false;
  const eventTeamId = payload.teamId ?? event.aggregateId.toString();
  if (scope.teamId && eventTeamId !== scope.teamId) return false;
  if (event.eventType.startsWith('submission.')) {
    return scope.isOrganizer || scope.memberTeamIds.has(eventTeamId);
  }
  return true;
}

export function addClient(res: Response, filters: { hackathonId?: string; teamId?: string }, lastId: number, scope: SubscriberScope): Client {
  const client: Client = {
    res,
    hackathonId: filters.hackathonId,
    teamId: filters.teamId,
    memberTeamIds: scope.memberTeamIds,
    isOrganizer: scope.isOrganizer,
    lastId,
  };
  clients.add(client);
  res.on('close', () => clients.delete(client));
  return client;
}

export function removeClient(res: Response): void {
  for (const c of clients) if (c.res === res) clients.delete(c);
}

/** Fan out a committed outbox event to matching subscribers. */
export function publishEvent(event: OutboxEventDoc): void {
  const frame = formatSseEvent(event);
  for (const c of clients) {
    if (!clientMaySee(c, event)) continue;
    try {
      c.res.write(frame);
    } catch {
      clients.delete(c);
    }
  }
}

export function clientCount(): number {
  return clients.size;
}
