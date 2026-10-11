# Deployment

## 1. Switch SQLite → PostgreSQL

Edit `backend/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

Set `DATABASE_URL` to your Postgres connection string, then:

```bash
cd backend
npx prisma migrate deploy   # or: npx prisma migrate dev --name init
npx prisma generate
npx tsx prisma/seed.ts      # optional demo data
```

## 2. Backend environment

Copy `backend/.env.example` to `backend/.env` and set real values:

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Postgres in production |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Long random secrets |
| `COOKIE_SECURE` | `true` behind HTTPS |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins |
| `JUDGE_MODE` | `docker` in production |
| `DOCKER_BIN` | Path to the docker CLI if not on PATH |

Build/run:

```bash
cd backend
npm run typecheck
npm start          # or: tsx src/index.ts  (add a process manager / container)
```

## 3. Code-runner host

Run the judge on a **separate, hardened host** — never co-located with the API or database.

- Install Docker only; expose no candidate-facing ports.
- Pre-pull images: `python:3.12-slim`, `eclipse-temurin:17-jdk`, `gcc:13`.
- The runner already enforces `--network none`, CPU/memory/PID limits, read-only rootfs and a
  tmpfs, plus a wall-clock timeout and container cleanup.
- At scale, put a queue (Redis/BullMQ) between the API and the runner.

## 4. Frontend

```bash
cd frontend
npm run build      # outputs dist/
```

Deploy `dist/` to any static host. Point its `/api` at the backend (reverse proxy) so cookies
stay first-party. Set `CORS_ORIGIN` on the backend to the site origin if not same-origin.

Example nginx:

```nginx
server {
  listen 443 ssl;
  root /var/www/assessment/dist;
  location / { try_files $uri /index.html; }
  location /api/ {
    proxy_pass http://backend:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 5. Production checklist

- [ ] HTTPS everywhere; `COOKIE_SECURE=true`; strong JWT secrets
- [ ] Postgres with backups and least-privilege credentials
- [ ] `JUDGE_MODE=docker` on an isolated runner host
- [ ] Reverse proxy forwards `X-Forwarded-*` (the API sets `trust proxy`)
- [ ] Restrict admin accounts; review the audit log
- [ ] Monitor the auto-submit sweep and judge latency
- [ ] Privacy notice + explicit camera/microphone consent before monitoring
- [ ] Data-retention and deletion policy for proctoring media/logs
- [ ] When running multiple API instances, guard the sweep with a lock or a single scheduler
