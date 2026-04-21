# Kayan Sweets Backend

Backend API for the Kayan Sweets loyalty / rewards platform.

- **Runtime:** Node.js 20+
- **Language:** TypeScript (strict)
- **Framework:** Express
- **Data:** Supabase (Postgres + Auth + Edge Functions)
- **Validation:** Zod
- **Logging:** Winston

The frontend lives in a separate repo (`kayan-frontend`). This repo contains **no** UI code.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in SUPABASE_*, SMS_PROVIDER_*, JWT_SECRET, ADMIN_SESSION_SECRET

# 3. Start dev server (watches src/, restarts on change)
npm run dev
```

The server listens on `PORT` (default `3000`). A health probe is exposed at `GET /health`.

## Scripts

| Command              | What it does                                     |
| -------------------- | ------------------------------------------------ |
| `npm run dev`        | Start with `nodemon` + `ts-node` + path aliases  |
| `npm run build`      | Compile TypeScript to `dist/` and rewrite paths  |
| `npm start`          | Run the compiled server from `dist/`             |
| `npm run typecheck`  | `tsc --noEmit` — type-check without emitting     |
| `npm run lint`       | ESLint                                           |
| `npm run lint:fix`   | ESLint with autofix                              |

## Project structure

```
src/
├── config/         env loader (ONLY place process.env is read)
├── constants/      http status, error codes/messages, business rules
├── controllers/    thin HTTP handlers
├── interfaces/     one interface per file, under <module>/<Name>.ts
├── lib/            logger, apiResponse, validation helpers
├── middleware/     global error handler, 404 fallback
├── routes/         Express routers (per feature)
├── services/       business logic / Supabase calls
└── server.ts       entry point (createApp + listener)
```

## Coding standards

All contributors (human or AI) must follow [CLAUDE.md](./CLAUDE.md). Highlights:

- No `any`. No `console.*`. No `process.env` outside `src/config/env.ts`.
- Every response uses the `ApiResponse<T>` wrapper (`{ success, data }` or `{ success, error }`).
- Every error code has both English and Arabic messages.
- Zod for all request validation.

## Project log

Progress is tracked chunk-by-chunk in [PROJECT_LOG.md](./PROJECT_LOG.md). Read the
most recent entry before starting a new task; append a new entry when you finish one.

## Deployment

### Supabase project setup

1. Create a new Supabase project (Riyadh region recommended).
2. Copy the **Project URL** and **service_role key** from *Settings → API*.
3. RLS is enabled on every table via the migrations — nothing additional to toggle.
4. Enable the `pg_cron` extension: *Database → Extensions → enable `pg_cron`*.

### Environment variables

| Variable                        | Required | Example                                         | Notes                                                         |
| ------------------------------- | :------: | ----------------------------------------------- | ------------------------------------------------------------- |
| `PORT`                          |    no    | `3000`                                          | Listener port. Default `3000`.                                |
| `NODE_ENV`                      |    no    | `production`                                    | `development`, `test`, `production`.                          |
| `SUPABASE_URL`                  |   yes    | `https://xxxx.supabase.co`                      | Supabase project URL.                                         |
| `SUPABASE_ANON_KEY`             |   yes    | `eyJhbGci…`                                     | Public anon key.                                              |
| `SUPABASE_SERVICE_ROLE_KEY`     |   yes    | `eyJhbGci…`                                     | Server-only. NEVER ship to the browser.                       |
| `SMS_PROVIDER_API_KEY`          |   yes    | `REDACTED`                                      | Unifonic (or equivalent) API key.                             |
| `SMS_PROVIDER_SENDER_ID`        |   yes    | `KAYAN`                                         | Sender ID registered with the SMS provider.                   |
| `JWT_SECRET`                    |   yes    | `32+ random bytes`                              | Customer token signing secret. Min 16 chars.                  |
| `ADMIN_SESSION_SECRET`          |   yes    | `32+ random bytes`                              | Admin token signing secret. Must differ from `JWT_SECRET`.    |
| `ADMIN_BOOTSTRAP_EMAIL`         |    no    | `admin@kayansweets.com`                         | First-admin bootstrap (one-shot).                             |
| `ADMIN_BOOTSTRAP_PASSWORD`      |    no    | `REDACTED`                                      | Min 12 chars. Rotate manually after first login.              |
| `ADMIN_BOOTSTRAP_NAME`          |    no    | `Administrator`                                 | Display name for the bootstrapped admin.                      |
| `CORS_ALLOWED_ORIGINS`          |   yes    | `https://app.kayansweets.com,https://admin…`    | Comma-separated list of allowed frontend origins.             |
| `LOG_LEVEL`                     |    no    | `info`                                          | `error`, `warn`, `info`, `debug`.                             |
| `SENTRY_DSN`                    |    no    | `https://…@sentry.io/…`                         | When unset, Sentry is a no-op.                                |
| `SENTRY_TRACES_SAMPLE_RATE`     |    no    | `0.1`                                           | 0.0 – 1.0. Defaults to 0.1.                                   |
| `APP_RELEASE`                   |    no    | `469cc63`                                       | Sentry release tag. Auto-wired to the git SHA at Docker build time (see **Release tagging** below). Defaults to `dev`. |

### Migrations

```bash
# Preferred: apply everything in src/supabase/migrations/ in order.
npx supabase db push

# Fallback: run each SQL file in sorted order via psql against the project's
# connection string.
```

### Seed

```bash
# Pilot-only seed. Hard-fails when NODE_ENV=production.
# Creates 2 admins + 20 customers with realistic stamp/reward distributions.
npm run seed:pilot
```

### Cron setup

Schedule the reward-expiry sweep nightly at 03:00 Riyadh time (00:00 UTC):

```sql
-- Run against the Supabase SQL editor once pg_cron is enabled.
select cron.schedule(
  'reward-expiry-nightly',
  '0 0 * * *',
  $$ select public.fn_expire_stale_rewards(); $$
);
```

### DNS / domain

The production API is expected at `api.kayansweets.com`. Whatever host you
deploy to, add its origin to `CORS_ALLOWED_ORIGINS` so the customer PWA and
admin portal can reach it. The PWA typically lives at
`app.kayansweets.com` and the admin portal at `admin.kayansweets.com`.

### Release tagging (Sentry)

Every captured error in Sentry is tagged with a release string so you can
tell which deploy produced which bug. The backend reads this from
`APP_RELEASE`; what you should set it to depends on how you're deploying:

- **Docker build (recommended):** the Dockerfile accepts a `GIT_SHA` build
  arg and bakes it into `APP_RELEASE`. Build like:
  ```bash
  docker build --build-arg GIT_SHA=$(git rev-parse --short HEAD) -t kayan-backend .
  ```
  Or with compose:
  ```bash
  GIT_SHA=$(git rev-parse --short HEAD) docker compose up --build
  ```
  If you forget, the image ships with `APP_RELEASE=dev` — safe, but less
  useful for triage.
- **Render:** set `APP_RELEASE=$RENDER_GIT_COMMIT` in the service's
  environment tab. Render exposes that variable automatically.
- **Railway:** set `APP_RELEASE=$RAILWAY_GIT_COMMIT_SHA`.
- **Fly.io:** pass `--build-arg GIT_SHA=$(git rev-parse --short HEAD)` on
  `fly deploy`.

Smoke tests are a **local-only** tool — they rely on the backend echoing
OTP codes in `NODE_ENV=development`. There is no production "OTP reveal"
endpoint by design (keeps the auth surface clean). If you want to smoke a
staging deploy later, reserve a small pool of fixed test phone numbers
and gate them in the OTP service instead.

### Deployment targets

Build once with the provided `Dockerfile` and ship the image to any
container-first host: **Render**, **Railway**, and **Fly.io** are all good
matches for this workload.

**Vercel is not recommended** for this service. Vercel's serverless runtime
cold-starts Express handlers on every invocation (bad tail-latency) and its
function timeout collides with the graceful-shutdown + long-poll patterns the
backend expects. Keep Vercel for the frontend only.

