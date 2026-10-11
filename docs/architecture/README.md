# Architecture

## Overview

```
                    ┌────────────────────────────┐
                    │        React SPA           │
                    │  (Vite, Tailwind, Monaco)  │
                    └──────────────┬─────────────┘
                                   │  /api (JSON, HTTP-only cookies)
                    ┌──────────────▼─────────────┐
                    │      Express + TypeScript   │
                    │  routes → services → Prisma │
                    └───────┬─────────────┬───────┘
                            │             │
                 ┌──────────▼───┐   ┌─────▼──────────────────────┐
                 │  Database    │   │        Code judge          │
                 │ (SQLite now, │   │  auto → Docker container   │
                 │  Postgres in │   │         OR local subprocess│
                 │  production) │   │  (timeout + process kill)  │
                 └──────────────┘   └────────────────────────────┘

      Background sweep (every 15s): auto-submit sessions past their deadline
```

The **server is the source of truth** for timing, scoring, identity, assignments and code
evaluation. The client renders and collects; it is never trusted for anything that affects
grades or eligibility.

## Backend layers

- **routes/** — thin HTTP handlers; validate with Zod, call a service, return JSON.
- **services/** — business logic:
  - `sessionService` — start/resume, server expiry, autosave, submit, auto-submit sweep, results.
  - `scoring` — deterministic evaluation of a session into a persisted `Result`; rank recompute.
  - `codeService` — validate language/size, invoke the judge, persist submissions + case results.
  - `proctoring` — record violations and apply the data-driven policy.
  - `judge/` — language specs, local runner, Docker runner, engine selection.
  - `audit` — admin audit log, candidate notifications, activity timeline.
- **auth/** — bcrypt hashing, JWT access/refresh with rotation, `authenticate` / `requireRole`.

## Data model (Prisma)

Core tables: `User`, `RefreshToken`, `PasswordResetToken`, `Test`, `Question`, `QuestionOption`,
`CodingQuestion`, `CodingTestCase`, `TestQuestion`, `TestAssignment`, `TestSession`,
`CandidateAnswer`, `CodeSubmission`, `TestCaseResult`, `Result`, `Violation`, `ActivityLog`,
`Notification`, `AuditLog`, `Setting`.

Key relationships:

- `Test` ↔ `Question` through `TestQuestion` (with `displayOrder` and optional `marksOverride`).
- `TestSession` is one attempt by one candidate, bounded by server-controlled `startedAt` /
  `expiresAt`; it owns answers, code submissions, violations and one `Result`.
- `CodeSubmission` owns per-case `TestCaseResult` rows; hidden case output is persisted for
  admins but redacted for candidates.
- Scoring keeps the **best** `SUBMIT` per coding question.

Enums are stored as strings and JSON columns as text, keeping the schema portable between
SQLite (dev) and PostgreSQL (production).

## Timing & submission flow

1. `POST /tests/:id/start` creates/reuses a session and computes
   `expiresAt = min(now + duration, test.endAt)`.
2. The client receives `serverNow` and `expiresAt`, computes a clock offset, and renders a
   countdown that cannot be extended by changing the local clock.
3. On expiry (client) or on the next write/heartbeat (server), the session is finalized and
   submitted with reason `TIME_EXPIRED`.
4. A background sweep finalizes any expired session even if the candidate's browser is gone.

Finalization grades the latest saved code for each coding question, then evaluates MCQs,
persists a `Result`, updates the assignment, notifies the candidate and recomputes ranks.

## Code execution architecture

```
candidate browser → POST /api/code/submit
   → validate language + size
   → judge()
        Docker: docker run --rm --network none --cpus 1 --memory Nm --pids-limit 128 \
                --read-only --tmpfs /tmp -v <workdir>:/box -w /box <image> <cmd>
        Local : spawn(cmd, { cwd: tempdir }) + hard timeout + process-tree kill
   → compare normalized stdout vs expected per case
   → compute weighted score → persist CodeSubmission + TestCaseResult[]
   → return per-case status (hidden details redacted)
```

`JUDGE_MODE=auto` picks Docker when the daemon answers and falls back to the local runner so the
platform is fully operational without Docker. Credentials and images are pulled outside the
request path; `DOCKER_BIN` pins the CLI location when it is not on `PATH`.

## Frontend

- `AuthContext` restores the session on load and exposes login/register/logout.
- The axios client retries once through `/auth/refresh` on a 401.
- `ProtectedRoute` gates candidate/admin areas by role (server still enforces).
- `useProctoring` wires real media/browser signals to the backend.
- `useServerCountdown` derives the timer from the server clock.
- The exam screen is a dedicated full-screen route outside the normal app chrome.

## Scaling notes

- Code execution is the heavyweight path; run it on separate worker hosts and, at higher scale,
  behind a queue (Redis/BullMQ). The `judge/` module is the seam to swap in.
- The stateless API scales horizontally behind a load balancer; sessions live in the database.
- Move `autoSubmitExpiredSessions` to a single dedicated scheduler when running multiple API
  instances (or guard it with a DB advisory lock) to avoid duplicate finalization.
