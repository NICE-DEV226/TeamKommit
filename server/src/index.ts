import { createApp } from './api/app.js';
import { connectDb } from './db.js';
import { config } from './config.js';
import { startOutboxPublisher } from './realtime/publisher.js';
import { startWorkerLoop } from './jobs/runner.js';

async function main() {
  await connectDb();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[api] TeamKommit listening on :${config.port} (${config.nodeEnv})`);
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  startOutboxPublisher();
  if (config.inlineWorker) {
    startWorkerLoop().catch((err) => console.error('[worker] fatal', err));
  }
}

main().catch((err) => {
  console.error('[api] fatal', err);
  process.exit(1);
});
