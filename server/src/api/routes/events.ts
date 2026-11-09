import { Router, type Request, type Response, type NextFunction } from 'express';
import { Types } from 'mongoose';
import { addClient, sseHeaders, formatSseEvent, clientMaySee, type SubscriberScope } from '../../realtime/sse.js';
import { OutboxEvent } from '../../models/OutboxEvent.js';
import { Membership } from '../../models/Membership.js';
import { requireAuth } from '../middleware/auth.js';
import { forbidden } from '../../lib/errors.js';

export const eventsRouter = Router();

/**
 * EventSource cannot set Authorization headers, so the access token may be
 * passed as ?token= — scoped to THIS route only, never accepted elsewhere.
 * Access tokens are short-lived JWTs; the client refreshes on reconnect.
 */
function tokenFromQuery(req: Request, _res: Response, next: NextFunction) {
  if (!req.headers.authorization && typeof req.query.token === 'string') {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}

/**
 * GET /api/events?hackathonId=..&teamId=..
 * SSE stream of committed domain events (transactional outbox).
 * Last-Event-ID replay: the outbox _id is the event id, so on reconnect we
 * replay everything after the client's last seen id (bounded window).
 *
 * Authorization: every subscriber is authenticated, and their scope is
 * resolved once at connect — active team memberships + organizer flag.
 * `team.*` events expose only board-public data; `submission.*` events are
 * delivered solely to members of the concerned team and organizers.
 * A `teamId` filter additionally requires membership (or organizer).
 */
eventsRouter.get('/', tokenFromQuery, requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hackathonId = typeof req.query.hackathonId === 'string' ? req.query.hackathonId : undefined;
    const teamId = typeof req.query.teamId === 'string' ? req.query.teamId : undefined;
    const lastIdRaw = String(req.headers['last-event-id'] ?? req.query.lastEventId ?? '');

    const memberTeamIds = new Set(
      (await Membership.find({ participantId: req.userId, status: 'ACTIVE' }).distinct('teamId')).map(String),
    );
    const scope: SubscriberScope = { hackathonId, teamId, memberTeamIds, isOrganizer: !!req.isOrganizer };

    // A team-scoped stream is member/organizer only — no peeking at other teams.
    if (teamId && !scope.isOrganizer && !memberTeamIds.has(teamId)) {
      throw forbidden('Not a member of this team');
    }

    sseHeaders(res);
    res.write(`retry: 3000\n\n`);

    // Replay missed events since Last-Event-ID (max 200, oldest→newest),
    // through the same authorization predicate as live fan-out.
    if (/^[a-f\d]{24}$/i.test(lastIdRaw)) {
      const missed = await OutboxEvent.find({ _id: { $gt: new Types.ObjectId(lastIdRaw) } })
        .sort({ _id: 1 }).limit(200).lean();
      for (const ev of missed) {
        if (clientMaySee(scope, ev as never)) res.write(formatSseEvent(ev as never));
      }
    }

    addClient(res, { hackathonId, teamId }, 0, scope);

    const heartbeat = setInterval(() => {
      try { res.write(`: ping\n\n`); } catch { clearInterval(heartbeat); }
    }, 25_000);
    res.on('close', () => clearInterval(heartbeat));
  } catch (err) {
    next(err);
  }
});
