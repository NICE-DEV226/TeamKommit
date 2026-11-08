# TeamKommit

Hackathon team-formation + project-submission platform built for the **Hack4Hack Crew Hiring Challenge 2026** — solves **PS1** (race-proof team formation at scale) and **PS2** (submissions that survive the last 10 minutes).

## Quick start

```bash
cp .env.example .env
npm install
docker compose up -d --build   # mongo replica set + minio + api + web + worker
npm run seed                   # 10,000 users + 2,000 teams
```

- Web: http://localhost:5173
- API: http://localhost:4000/api/health
- MinIO console: http://localhost:9001 (minioadmin/minioadmin)

Dev mode without Docker for the frontend: `npm run dev` (API still needs MongoDB with a replica set — `docker compose up mongo minio minio-init` suffices).

## Layout

```
server/   Express + TypeScript API, domain layer, worker, seed, tests
web/      React + Vite + TS + Tailwind + TanStack Query
docs/     DESIGN.md — architecture & trade-offs
load/     k6 scripts (board p95<200ms, submissions crush)
```

## Test & load

```bash
npm test                 # 25 tests incl. the 50-way admission race (CI: GitHub Actions)
k6 run load/board.js     # p95 < 200ms target on /api/board
```

## Highlights

- **Race-proof admission**: single transaction, conditional team-document update as serialization point, partial unique index as DB-level guarantee. Proven by an automated 50-concurrent-admission test.
- **Idempotent everything**: `Idempotency-Key` header on mutating endpoints; retries replay stored results.
- **Explainable matching**: `GET /api/teams/:id/suggestions` returns decomposed scores (team fit / participant fit / mutual) with reasons.
- **Deadline enforced server-side** with a documented grace policy; late attempts audited.
- **Exactly-once job worker** with lease-based crash recovery.
- **Live UI**: SSE-driven updates, optimistic actions, keyboard-accessible, mobile-friendly.
