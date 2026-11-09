import { connectDb } from './db.js';
import { startWorkerLoop } from './jobs/runner.js';

async function main() {
  await connectDb();
  await startWorkerLoop();
}

main().catch((err) => {
  console.error('[worker] fatal', err);
  process.exit(1);
});
