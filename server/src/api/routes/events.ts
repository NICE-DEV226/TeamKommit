import { Router, type Request, type Response } from 'express';
import { addClient, sseHeaders } from '../../realtime/sse.js';

export const eventsRouter = Router();

/**
 * GET /api/events?hackathonId=..&teamId=..
 * Server-Sent Events stream of committed domain events (from the outbox).
 * Supports Last-Event-ID for reconnect replay at the client level.
 */
eventsRouter.get('/', (req: Request, res: Response) => {
  const hackathonId = typeof req.query.hackathonId === 'string' ? req.query.hackathonId : undefined;
  const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined;
  const lastId = Number(req.headers['last-event-id'] ?? req.query.lastEventId ?? 0) || 0;

  sseHeaders(res);
  res.write(`retry: 3000\n\n`);
  addClient(res, { hackathonId, teamId }, lastId);

  const heartbeat = setInterval(() => {
    try { res.write(`: ping\n\n`); } catch { clearInterval(heartbeat); }
  }, 25_000);
  res.on('close', () => clearInterval(heartbeat));
});
