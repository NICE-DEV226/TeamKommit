# TeamKommit — agent notes

## Git conventions (user preference)
- Commits and PRs: the user (NICE-DEV226) is the sole author.
- NO "Generated with Devin", NO "Co-Authored-By" trailers. Plain commit messages only.

## Verify
- `npm test` (server, 25 tests incl. admission race test — needs mongodb-memory-server replSet)
- `npm run build` then `node server/dist/index.js` for prod-mode local runs
- `k6 run load/board.js` — board p95 target < 200ms

## Infra
- docker compose: mongo (rs0 replica set, host `mongo:27017`), s3mock :9090 (S3-compatible; minio images unavailable on this registry), api :4000, web :5173 (nginx), worker
- Local dev mongo URI needs `directConnection=true` (rs advertises `mongo:27017`)
- `S3_PUBLIC_ENDPOINT` = host embedded in presigned URLs (browser-reachable); `S3_ENDPOINT` = internal
