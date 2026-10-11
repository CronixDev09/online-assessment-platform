# Online Assessment & Coding Proctoring Platform

A complete, working full-stack platform for secure online examinations with **MCQ** and
**coding** questions, **real isolated code execution**, server-authoritative timing, browser
proctoring, automated scoring, results and leaderboards.

This is a functional system — not a UI prototype. Answers, code, violations and scores are
persisted to a relational database and evaluated on the server.

---

## Table of contents

- [What works](#what-works)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [The code judge (Docker vs local)](#the-code-judge-docker-vs-local)
- [Project structure](#project-structure)
- [Scripts](#scripts)
- [Security model](#security-model)
- [Data integrity rules](#data-integrity-rules)
- [Known limitations](#known-limitations)
- [Roadmap (Phase 2)](#roadmap-phase-2)

---

## What works

**Authentication**
- Register / login / logout / refresh-token rotation / forgot & reset password
- HTTP-only cookies, bcrypt password hashing, role-based authorization enforced server-side
- The first registered account auto-bootstraps as admin

**Admin**
- Dashboard with KPIs, participation, pass/fail and violations-over-time charts
- User management (create/edit/disable/reset password/reset attempt, attempt history)
- Question bank (MCQ and coding), duplicate/archive, inline test-case runner
- Test builder: settings, question selection & ordering, candidate assignment, publish
- Live monitoring of active sessions (time left, connection, violations, terminate)
- Results with per-question analysis, leaderboard, violations log
- Reports (test / question / coding / proctoring) with CSV export
- Configurable violation policy and leaderboard visibility

**Candidate**
- Dashboard of assigned tests with lifecycle states (upcoming/available/in-progress/completed/expired)
- Instructions → system check (camera, mic, browser, network, fullscreen) → fullscreen → test
- MCQ answering with autosave, code editor with run/submit, marking for review
- Server-driven countdown, connection recovery, autosave, automatic submission
- Results, question-level analysis, submission history, leaderboard, notifications, profile

**Coding engine**
- Monaco editor, Python / Java / C++ (C++ requires the `gcc` image), syntax highlighting
- Run against sample cases; submit against all cases including hidden ones
- Per-case status: Accepted, Wrong Answer, Compilation Error, Runtime Error, Time/Memory limit
- Hidden test-case data is never returned to candidates

**Proctoring**
- Real camera + microphone streams, tab switch, window blur, fullscreen exit, network
- Events are recorded as violations and graded against a configurable policy
- Camera preview, media state, connection state and violation count shown to candidate/admin

## Tech stack

| Layer     | Technology |
|-----------|------------|
| Frontend  | React 18, TypeScript, Vite, Tailwind CSS v4, Monaco Editor, Recharts, React Router |
| Backend   | Node.js, TypeScript, Express, Zod, JWT (HTTP-only cookies), bcrypt |
| Database  | Prisma ORM + SQLite (swap `provider` to `postgresql` for production — schema is Postgres-compatible) |
| Judge     | Docker (isolated) with automatic local-subprocess fallback |

## Prerequisites

- **Node.js 18+**
- **Docker Desktop** (recommended, for the isolated code judge). Without Docker the platform
  still runs using a local subprocess runner.
- Python 3 / Java / a C++ compiler on the host **only if** you use the local judge fallback.

## Quick start

```bash
# from online-assessment-platform/

# 1. Install dependencies
npm run install:all

# 2. Generate the Prisma client, create the SQLite DB and seed demo data
npm run db:setup

# 3. Run backend + frontend together
npm run dev
```

Then open the URL Vite prints (default **http://localhost:5173**, or the next free port).

Backend runs on **http://localhost:4000**.

### Manual steps (equivalent)

```bash
cd backend && npm install
cd backend && npx prisma generate && npx prisma db push && npx tsx prisma/seed.ts
cd backend && npm run dev      # terminal 1
cd frontend && npm install && npm run dev   # terminal 2
```

## Demo accounts

| Role      | Email                    | Password       |
|-----------|--------------------------|----------------|
| Admin     | `admin@example.com`      | `Admin@12345`  |
| Candidate | `candidate@example.com`  | `Candidate@123`|
| Candidate | `amit@example.com`       | `Candidate@123`|
| Candidate | `neha@example.com`       | `Candidate@123`|

The seed creates a **Sample Assessment** (2 MCQs + 1 coding problem, 30 min) assigned to all
candidates.

## The code judge (Docker vs local)

The judge is pluggable and selected at runtime by `JUDGE_MODE` in `backend/.env`:

| Mode     | Behaviour |
|----------|-----------|
| `auto`   | **Default.** Uses Docker when the daemon is reachable, otherwise the local subprocess runner. |
| `docker` | Always Docker (fails if unavailable). |
| `local`  | Always the host subprocess runner. |

**Docker execution** (`backend/src/services/judge/docker.ts`) runs each submission in a
container with `--network none`, `--cpus 1`, `--memory <limit>`, `--pids-limit 128`,
`--read-only` root filesystem, a small `tmpfs`, and a hard wall-clock timeout. This is the
production path.

**Local execution** (`backend/src/services/judge/local.ts`) is a real subprocess runner with a
hard timeout and process-tree kill. It is honest about its limits: it **cannot** enforce a
memory ceiling or full filesystem isolation. Use Docker for real exams.

Pull the images you need:

```bash
docker pull python:3.12-slim
docker pull eclipse-temurin:17-jdk
docker pull gcc:13        # required only for C++
```

Check what the backend detected: `GET /api/health` returns
`{ judge: { mode, dockerAvailable } }`.

## Project structure

```
online-assessment-platform/
├── backend/
│   ├── prisma/            # schema.prisma, seed.ts
│   └── src/
│       ├── auth/          # passwords, tokens, middleware
│       ├── routes/        # auth, candidate, session, code, proctoring, admin/*
│       ├── services/      # sessionService, scoring, proctoring, codeService, judge/
│       └── utils/
├── frontend/
│   └── src/
│       ├── components/    # ui, layouts, CodeEditor, ProtectedRoute
│       ├── context/       # AuthContext
│       ├── hooks/         # useProctoring, useServerCountdown
│       ├── lib/           # api client, formatters
│       └── pages/         # public, candidate/*, admin/*
└── docs/
    ├── api/
    ├── architecture/
    └── deployment/
```

## Scripts

| Location | Command | Purpose |
|----------|---------|---------|
| root | `npm run install:all` | Install backend + frontend deps |
| root | `npm run db:setup` | Generate client, push schema, seed |
| root | `npm run dev` | Run backend + frontend concurrently |
| backend | `npm run dev` | Backend with hot reload |
| backend | `npm run seed` | Re-seed demo data |
| backend | `npm run prisma:push` | Apply schema to the DB |
| backend | `npm run typecheck` | TypeScript check |
| frontend | `npm run dev` | Vite dev server |
| frontend | `npm run build` | Type-check + production build |

## Security model

- Passwords hashed with bcrypt (cost 12); never stored or logged in plaintext.
- Sessions use HTTP-only, SameSite=Lax cookies with rotating refresh tokens (hashed at rest).
- Access tokens are short-lived; the frontend transparently refreshes on 401.
- Every admin route requires `authenticate` + `requireRole('ADMIN')` on the server.
- Rate limiting on auth endpoints and globally.
- Zod validates every request body; Prisma parameterizes all queries.
- Ownership checks prevent one candidate from reading another's session, answers or results.
- Hidden test-case input/output is stripped from every candidate-facing response.
- Admin actions are written to an audit log.

## Data integrity rules

The **server** is authoritative for: identity, assignment, duration, start/end time, question
marks, correct answers, scoring, code evaluation, violation counts and submission status.
The client only displays and collects data. A periodic server sweep auto-submits any session
whose deadline has passed, and the client countdown is derived from the server clock.

## Known limitations

- **Storage:** SQLite is used for zero-install local development. Switch the Prisma datasource
  to `postgresql` for production (see `docs/deployment`).
- **C++:** the `gcc:13` image is large; if it is not pulled, C++ submissions report an internal
  judge error while Python and Java continue to work.
- **Email:** notifications are in-app only; password-reset tokens are surfaced in the API
  response in development instead of being emailed.
- **Browser proctoring is advisory.** A web app can detect and record many signals but cannot
  guarantee a candidate is physically alone or prevented from external assistance. Stronger
  proctoring (screen recording, identity checks, lockdown browsers) is out of scope for the
  browser-based MVP and carries additional consent/privacy requirements.

## Roadmap (Phase 2)

Advanced analytics, email notifications, CSV/Excel question import, bulk candidate import,
question versioning, multiple organizations, screen recording, AI-assisted proctoring,
plagiarism/similarity detection, PDF reports, certificates, multi-admin permissions.
