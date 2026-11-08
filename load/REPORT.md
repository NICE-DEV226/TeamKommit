# Load test report — TeamKommit

Environment: local dev machine, API compiled (`node dist/index.js`), MongoDB 7 single-node replica set (Docker), 10,000 users / 2,000 teams seeded.

## PS1 — Team board (`GET /api/board?pageSize=20`)

Command: `k6 run --vus 100 --duration 20s load/board.js`

| Metric | Value | Target |
|---|---|---|
| http_req_duration p(95) | **189.6 ms** | < 200 ms ✓ |
| http_req_duration avg | 58.8 ms | — |
| http_req_failed | **0.00 %** (0 / 3 609) | < 1 % ✓ |
| http_reqs | 175.9 req/s | — |
| VUs | 100 sustained | 100 ✓ |

Optimizations that got us under target: compound index `(hackathonId, lifecycleStatus, recruitmentStatus, memberCount, _id)` matching the board sort, field projection via `.select()`, stable `_id` tiebreak for pagination, compiled production build.

## PS2 — Submission control plane (`load/submissions.js`)

Simulates 2,000 teams submitting in 10 min (constant-arrival-rate, 200/min, ≤300 VUs). File bytes bypass the API entirely (direct-to-S3 multipart), so API latency measures only the control plane. Target p(95) < 300 ms — run on the deployed environment and attach output here.

## Correctness under load

The admission path was verified separately by `server/src/tests/race.test.ts`: 50 concurrent `admit()` calls competing for a single remaining seat → exactly 1 success, `memberCount` exact, single audit event. This test runs in CI on every push.
