# API reference

Base URL: `/api`. Auth uses HTTP-only cookies (`oat_at`, `oat_rt`) or `Authorization: Bearer <accessToken>`.

## Authentication — `/api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | – | Create account (first account becomes ADMIN) |
| POST | `/login` | – | Sign in |
| POST | `/logout` | – | Clear cookies, revoke refresh token |
| POST | `/refresh` | cookie | Rotate tokens |
| GET | `/me` | user | Current user |
| POST | `/forgot-password` | – | Request reset (returns token in dev) |
| POST | `/reset-password` | – | Reset with token |

## Candidate — shared, authenticated

| Method | Path | Description |
|--------|------|-------------|
| GET | `/candidate/tests` | Assigned tests with status + counts |
| GET | `/candidate/tests/:id` | Test detail for instructions |
| POST | `/tests/:id/start` | Start or resume a session (server sets expiry) |
| GET | `/candidate/submissions` | Submission history |
| GET | `/candidate/profile` | Profile |
| GET | `/candidate/notifications` | Notifications + unread count |
| POST | `/candidate/notifications/:id/read` | Mark one read |
| POST | `/candidate/notifications/read-all` | Mark all read |
| GET | `/candidate/languages` | Judge mode + locally detected runtimes |
| GET | `/leaderboard/:testId` | Leaderboard (respects visibility config) |

## Test sessions — `/api/sessions`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/:id` | Full session state (questions, answers, drafts, server time) |
| POST | `/:id/answer` | Autosave an MCQ answer |
| POST | `/:id/code` | Autosave a code draft |
| POST | `/:id/submit` | Submit (`reason`: `CANDIDATE` \| `TIME_EXPIRED`) |
| GET | `/:id/result` | Result (owner or admin) |

## Code — `/api/code`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/run` | Run against **sample** cases only (not persisted) |
| POST | `/submit` | Grade against **all** cases, persist submission |
| GET | `/submissions/:id` | Submission + per-case results (hidden data redacted) |

## Proctoring — `/api/proctoring`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/session` | Mark proctoring started |
| POST | `/events` | Report a violation event; returns warning tally + action |
| POST | `/heartbeat` | Keepalive; returns authoritative status + time left |
| POST | `/disconnect` | Record a connection loss |

Event types: `TAB_SWITCH`, `WINDOW_BLUR`, `FULLSCREEN_EXIT`, `CAMERA_STOPPED`, `CAMERA_DENIED`,
`MICROPHONE_STOPPED`, `MICROPHONE_DENIED`, `NETWORK_LOST`, `NETWORK_RESTORED`,
`UNAUTHORIZED_API_ATTEMPT`, `DUPLICATE_SUBMISSION`.

## Admin — `/api/admin` (requires ADMIN)

**Users** `GET /users` · `GET /users/:id` · `POST /users` · `PUT /users/:id` ·
`DELETE /users/:id` (disable) · `POST /users/:id/reset-password` · `POST /users/:id/reset-attempt`

**Questions** `GET /questions` · `GET /questions/:id` · `POST /questions` · `PUT /questions/:id` ·
`POST /questions/:id/duplicate` · `DELETE /questions/:id` (archive if in use)

**Test cases** `GET /test-cases?questionId=` · `POST /test-cases` · `PUT /test-cases/:id` ·
`DELETE /test-cases/:id` · `POST /test-cases/:id/test` · `POST /test-cases/reorder`

**Tests** `GET /tests` · `POST /tests` · `GET /tests/:id` · `PUT /tests/:id` ·
`DELETE /tests/:id` · `PUT /tests/:id/questions` · `POST /tests/:id/assign` ·
`DELETE /tests/:id/assign/:candidateId` · `POST /tests/:id/publish` ·
`GET /tests/:id/monitoring` · `GET /tests/:id/activity`

**Analytics** `GET /dashboard` · `GET /results` · `GET /results/:id` · `GET /leaderboard?testId=` ·
`GET /violations` · `GET /monitoring` · `GET /reports?testId=` · `GET /reports/export?testId=&type=`
(`results` \| `questions` \| `violations`) · `GET /settings` · `PUT /settings/violation-policy` ·
`PUT /settings/leaderboard` · `GET /audit-logs` · `POST /sessions/:id/terminate`

## Errors

```json
{ "error": "Human readable message", "code": "MACHINE_CODE" }
```

`400` validation · `401` unauthenticated · `403` forbidden · `404` not found ·
`409` conflict (e.g. session closed) · `429` rate limited · `500` internal.
