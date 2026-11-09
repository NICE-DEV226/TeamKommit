# TeamKommit — Design Doc

One platform solving both Hack4Hack 2026 problem statements: **PS1** race-proof team formation, **PS2** deadline-crush project submissions.

## Data model

- **Hackathon** — event scope: formation window, team size bounds, submission deadline, succession policy.
- **User** — participant profile: skills (canonical id + self-declared level 0–1), roles, availability windows, timezone, discovery privacy flags.
- **Team** — `memberCount` maintained aggregate, `version` (optimistic concurrency), `lifecycleStatus` (ACTIVE/DISBANDED) × `recruitmentStatus` (OPEN/PAUSED/CLOSED) kept as separate dimensions; capacity FULL is *derived*, never stored as a policy.
- **Membership** — ACTIVE/LEFT/REMOVED; **partial unique index** `(hackathonId, participantId) WHERE status=ACTIVE` → one team per person per hackathon, enforced by MongoDB itself.
- **Invitation** — direct or shareable `CODE` kind; only `sha256(code)` stored (128-bit entropy, never the raw code); expiry + single-use.
- **JoinRequest** — one PENDING per (team, participant) via partial unique index.
- **AuditEvent / OutboxEvent** — written in the *same transaction* as every business change.
- **IdempotencyKey** — `(scope, key)` unique, request hash, PROCESSING/SUCCEEDED/REJECTED states.
- **Submission** — immutable versions; **UploadSession** — resumable multipart upload; **Job** — leased queue.

## How races are prevented (PS1)

All membership creation funnels through `admit()` — one MongoDB transaction:

1. Conditional update on the **team document**: `{ lifecycleStatus: ACTIVE, recruitmentStatus: OPEN, admissionsHalted ≠ true, $expr: { $lt: ["$memberCount", "$maxSize"] } }` → `$inc memberCount, version`. MongoDB serializes writes to the same document → this is the capacity serialization point; 50 concurrent clicks yield exactly one success per seat.
2. Membership insert guarded by the partial unique index (one team per person per hackathon even across *different* teams).
3. Invite/join-request consumed by conditional update inside the same tx.
4. Audit + outbox + idempotency result commit atomically.

Idempotency: key claimed before the tx; terminal results persisted *inside* it (success) or standalone after abort (rejection) → retries replay, never duplicate. Stale PROCESSING locks expire and are reclaimed.

Proof: `race.test.ts` — 50 concurrent `admit()` calls on a single remaining seat → exactly 1 success, `memberCount` exact, 1 audit event.

## Upload flow & deadline policy (PS2)

- Client asks API for an upload session → API creates an **S3 multipart upload** and returns presigned `UploadPart` URLs (8 MB chunks, 100 MB max). Bytes flow browser→S3 directly; the API never streams files.
- Resume: `GET /uploads/:id/parts` proxies `ListParts`; client re-uploads only missing parts.
- Complete: API verifies the object with `HeadObject`, marks the submission CHECKING, enqueues `check:<submissionId>:<version>`.

**Deadline & grace (server clock only):** uploads *started* before `submissionDeadline` may complete until `deadline + 15 min`; sessions created after the deadline must finish before it. Metadata confirmation accepted until `deadline + 30 min`. Every late attempt is audit-logged for the organizer dashboard. Versions are immutable — the latest confirmed version wins.

## Exactly-once jobs

Mongo `jobs` collection: unique `jobId` (dedupe), lease-based claim (`RUNNING` + `leaseExpiresAt`; expired lease = crashed worker → reclaimed), bounded retries with backoff. The check handler writes results keyed to `(submissionId, version)` — a retry recomputes and overwrites the same fields, never duplicates. Proven by `jobs.test.ts` lease-expiry test and the worker-crash scenario.

Checks: magic-byte type detection (never the extension), zip entry-count + compression-ratio bomb detection (streaming via yauzl), link liveness (HEAD/GET with timeout), preview extraction (README from zip / first PDF page).

## Matching engine (PS1 — deterministic, no LLM)

Teammate recommendations are pure math — reproducible, auditable, decomposable in the UI. No model, no embeddings, no randomness.

- **Taxonomy v1** (`domain/taxonomy.ts`): 20 canonical skills + ~80 aliases, versioned. `React.js`/`frontend`/`js` → one skill. Canonicalization runs at write boundaries *and* at read time (legacy/seed data).
- **Team value** `V_T = 0.5·Δskill + 0.3·novelty + 0.2·avail`:
  - `Δskill` — marginal gain of submodular coverage `f(S) = Σ w_s·min(1, cov_s/2)`; diminishing returns are the point (greedy 1−1/e guarantee).
  - `novelty` — fraction of `skillsSought` the candidate covers that the team lacks.
  - `avail` — quorum: fraction of the team sharing usable weekly time with the candidate.
- **Person value** `V_P = 0.6·fit + 0.4·role`: candidate skill fit + leadership-gap fit (`canLead` × team's open lead role).
- **Availability** (`domain/time.ts`): the week is a circle of 10 080 minutes — overnight windows and timezone offsets are exact, weighted by a circadian curve (3 AM ≠ 3 PM).
- **Final score** `√(V_T·V_P)`, sorted score-desc then user-id — fully deterministic. Every component is returned and rendered as a stacked bar in the UI.

## Roles & authorization

Four distinct surfaces, enforced server-side (the UI merely hides what would 403):

| Role | Scope | Powers |
|---|---|---|
| Guest | public | board, team pages, people discovery |
| Participant | self | profile, join requests, submissions for own team |
| Team member | one team | view audit/suggestions, submit, leave |
| Team leader | one team | invite codes, decide requests, remove members, succession on leave |
| Organizer (`User.isOrganizer`) | platform | `/admin` stats + CSV, all submission events |

Team leadership is contextual (`Team.leaderId` + membership `role`), never a global flag. `isOrganizer` is the only global role and cannot be self-assigned. `roles.test.ts` encodes the full matrix — every protected route × every role.

## Real-time

Transactional outbox → publisher tails unpublished events → SSE `/api/events` with `Last-Event-ID` replay. Chosen over WebSockets: server→client only need, simpler, proxy-friendly.

**Security:** `/api/events` requires auth. Since `EventSource` cannot set headers, a `?token=` query param is accepted *on this route only* (never elsewhere — tested) and carries the short-lived access JWT; the client refreshes it before every reconnect. Each subscriber's scope is resolved at connect (active memberships + organizer flag): `team.*` events expose only board-public data, while `submission.*` events are delivered solely to that team's members and organizers — enforced identically for live fan-out and replay via `clientMaySee`. A `teamId` filter requires membership or organizer (403 otherwise). Guests get no stream at all (UI only connects when logged in).

## Trade-offs

- **Mongo counter vs seat records**: counter + conditional update chosen; seat records would be more explicit but costlier. Reconciliation job can halt admissions on drift (`admissionsHalted`).
- **SSE vs WebSocket**: SSE suffices (no client→server push needed).
- **In-process worker vs BullMQ**: Mongo-lease queue keeps one less dependency; extractable later.
- **Matching score**: geometric mean `√(V_T·V_P)` over submodular skill coverage, circular-week availability quorum and candidate fit — see "Matching engine" above.

**With one more week:** Redis-backed rate-limit buckets + board cache, virus scanning (ClamAV sidecar), email receipts with file SHA-256, k6 report automation in CI, E2E tests (Playwright) for the keyboard-only flow.
