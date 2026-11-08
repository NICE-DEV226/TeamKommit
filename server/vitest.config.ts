import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 120000,
    pool: 'forks',
    // DB-backed tests must not run concurrently against shared collections.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/teamkommit-test',
    },
  },
});
