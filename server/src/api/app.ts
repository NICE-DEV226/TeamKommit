import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { authRouter } from './routes/auth.js';
import { teamsRouter } from './routes/teams.js';
import { membershipRouter } from './routes/membership.js';
import { submissionsRouter } from './routes/submissions.js';
import { adminRouter } from './routes/admin.js';
import { eventsRouter } from './routes/events.js';
import { errorHandler, notFoundHandler } from './middleware/common.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '256kb' })); // JSON only — files never transit the API

  // Global safety-net limiter. Kept high because the board must sustain
  // hundreds of concurrent readers; real abuse protection lives on the
  // sensitive endpoints (auth: 20/min, invite codes: ~7/min).
  const globalLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60_000,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', globalLimiter);

  app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

  app.use('/api/auth', authRouter);
  app.use('/api', teamsRouter);        // /hackathons, /board, /people, /teams/...
  app.use('/api', membershipRouter);   // /invitations, /requests, /teams/:id/join-request...
  app.use('/api/submissions', submissionsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/events', eventsRouter);

  // Serve the built SPA when web/dist is present (single-service deploys).
  // API 404s are untouched — the fallback only catches non-/api GETs.
  const webDist = join(dirname(fileURLToPath(import.meta.url)), '../../../web/dist');
  if (existsSync(join(webDist, 'index.html'))) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
