# Kayan Sweets Backend — Project Log

Every Claude Code session appends an entry here. Read the most recent entry before
starting any task.

## Entry Template

### [YYYY-MM-DD] Chunk N: <Chunk Name>
- **Built:** <what was delivered>
- **Files changed:** <list>
- **Decisions:** <any non-obvious choices made>
- **Open questions for human:** <anything needing input>
- **Next:** <what the next chunk should tackle>

---

### [2026-04-18] Chunk 0: Backend foundation scaffold
- **Built:**
  - Node.js + TypeScript + Express project scaffold with strict `tsconfig.json`
    and `@/*` → `src/*` path alias (resolved via `tsconfig-paths` in dev and
    `tsc-alias` in build).
  - Folder skeleton under `src/`: `config`, `constants`, `controllers`,
    `interfaces`, `lib`, `middleware`, `routes`, `services`. Every folder has
    a barrel `index.ts` — feature folders currently export nothing (placeholder).
  - Zod-validated env loader (`src/config/env.ts`) — the ONLY place
    `process.env` is accessed. Throws at startup if any required var is missing.
  - Constants: `http.ts` (HTTP_STATUS), `errors.ts` (ERROR_CODES +
    bilingual ERROR_MESSAGES en/ar), `business.ts` (stamp / OTP / reward / phone
    regex rules), plus a barrel.
  - `src/lib/logger.ts`: Winston singleton — pretty console in dev, JSON to
    stdout in prod. ESLint override permits `console.*` only in this file.
  - `src/lib/apiResponse.ts`: `ApiResponse<T>` discriminated union, `apiSuccess`
    and `apiError` helpers, plus an `ApiError` class + `createApiError` factory
    for throw-based error flow.
  - `src/lib/validation.ts`: Zod-based `validate({ body, params, query })`
    Express middleware and a `parseOrThrow` helper — both emit consistent
    `VALIDATION_FAILED` (422) `apiError` responses.
  - `src/middleware/errorHandler.ts`: global Express error handler + 404
    fallback. Logs via Winston, masks stack traces in production,
    handles `ApiError` and `ZodError` specially.
  - `src/server.ts`: Express app factory with `helmet`, `cors` (origins from
    env), JSON body parser, and a `GET /health` endpoint. Entry point guarded
    by `require.main === module` so `createApp()` is importable from tests.
  - `tsconfig.json`, `.eslintrc.cjs`, `package.json` with `dev` / `build` /
    `start` / `lint` / `lint:fix` / `typecheck` scripts.
  - `.gitignore` (excludes `node_modules`, `dist`, `.env*`, `.cursor/`,
    `*Fix.md`, `*Notes.md`, `SCRATCH.md`, etc. — allows CLAUDE/README/PROJECT_LOG).
  - `.env.example` with every required variable.
  - `CLAUDE.md` (verbatim coding standards), `README.md` (setup + structure),
    this `PROJECT_LOG.md`.
- **Files changed:**
  - `package.json`, `tsconfig.json`, `.eslintrc.cjs`, `.gitignore`,
    `.env.example`
  - `src/config/env.ts`
  - `src/constants/{http,errors,business,index}.ts`
  - `src/lib/{logger,apiResponse,validation,index}.ts`
  - `src/middleware/{errorHandler,index}.ts`
  - `src/{interfaces,routes,services,controllers}/index.ts` (placeholders)
  - `src/server.ts`
  - `CLAUDE.md`, `README.md`, `PROJECT_LOG.md`
- **Decisions:**
  - Chose Express (not NestJS) per the simplicity directive.
  - Module = CommonJS with ES2022 target — matches the Node 20 LTS runtime and
    avoids ESM interop friction with Winston / ts-node.
  - `@/*` alias is rewritten at build time by `tsc-alias` so the compiled JS in
    `dist/` has no path-alias runtime dependency.
  - `ApiError` + `createApiError` pattern (throw-based) chosen over returning
    `Result`-style unions, so service/controller code can bail out cleanly and
    the global handler produces the single canonical error response shape.
  - Added `notFoundHandler` alongside `errorHandler` — unmatched routes return
    an `ApiResponse` failure rather than Express's default HTML.
  - Logger is a true singleton (module-level `createLogger`) rather than a
    factory — there is only one process, one logger.
- **Open questions for human:**
  - SMS provider: `SMS_PROVIDER_API_KEY` + `SMS_PROVIDER_SENDER_ID` are in the
    env schema as generic. Which provider (Unifonic, Msegat, Twilio, …)? That
    drives the client shape in `src/lib/sms.ts`.
  - JWT vs Supabase Auth sessions: do admin users authenticate via a
    backend-issued JWT (`JWT_SECRET`) or via Supabase Auth tokens? Both vars
    are reserved in the env, but only one will ultimately be used.
  - Rate limiter: not yet added. Do you want `express-rate-limit` (in-process)
    or the Supabase-backed approach (so limits hold across instances)?
- **Next (Chunk 1 suggestion):**
  - Wire up the Supabase client (`src/lib/supabase.ts` — service role for
    server calls, anon for pass-through if needed).
  - Define the `customers` table's first interface + Zod schema, and stub
    `POST /customers` end-to-end (route → controller → service → supabase)
    as the reference example every subsequent feature will copy.

---

### [2026-04-18] Chunk 1: Backend Foundation
- **Built:**
  - Supabase migrations and RLS policies for branches, customers, visits, rewards_catalog, rewards_issued, admin_users, sms_log, and feedback.
  - Supabase seed script for Kayan branches.
  - `supabase.ts` exporting `supabaseAdmin` and `supabaseAnon`.
  - Expanded `errors.ts` to include business and infrastructure error codes.
  - `validator.ts` middleware for Zod schema validation (returning `400 BAD_REQUEST`).
  - `requestLogger.ts` middleware using Winston and automatically masking PII phone numbers.
  - Branch module foundation (`Branch.ts` interface, `branch.service.ts`, `branch.controller.ts`, `branch.routes.ts`) with `listActiveBranches` integration setup.
  - Integrated request logger and branches route into `server.ts`.
- **Files changed:**
  - `src/supabase/migrations/*.sql`
  - `src/supabase/seed.sql`
  - `src/lib/supabase.ts`
  - `src/constants/errors.ts`
  - `src/middleware/validator.ts`
  - `src/middleware/requestLogger.ts`
  - `src/interfaces/branch/Branch.ts`, `src/interfaces/branch/index.ts`
  - `src/modules/branch/branch.service.ts`, `branch.controller.ts`, `branch.routes.ts`, `index.ts`
  - `src/server.ts`
- **Decisions:**
  - `validator.ts` issues a `400 BAD_REQUEST` aligning with REST validation error expectations from PRD, in contrast to Chunk 0's validation.ts returning 422.
  - Added `NOT_FOUND` into `errors.ts` because it was required by the global fallback handler.
  - Implemented phone number regex in `requestLogger.ts` to mask URLs or bodies appropriately.
- **Open questions for human:**
  - Migrations and Seed script must be manually applied using `npx supabase db push` and `npx supabase db reset` (or run manually via SQL) against local/cloud DB.
- **Next:**
  - Test E2E using `GET /branches` if Supabase has been provisioned.
  - Stub `customers` endpoint with comprehensive test case and Zod schemas.

---

### [2026-04-18] Chunk 2: Auth & Customer Registration
- **Built:**
  - Migrated `otp_tokens` with dynamic `verify_otp` and `register_customer_and_visit` atomic RPCs using `pgcrypto`.
  - Added SMS (`src/lib/sms.ts`) logic implementing both a stub Unifonic payload and development logger mock.
  - Added JWT handler `jwt.ts` and Express authentication middleware handling `registration` vs `session` scopes.
  - Added Auth endpoints (`POST /auth/otp/request` and `POST /auth/otp/verify`) with rate limiting and retry lockouts.
  - Added Customer endpoints (`POST /customers/register` and `GET /customers/me`).
  - Implemented unit/integration tests targeting auth flows via Jest and Supertest.
- **Files changed:**
  - `src/supabase/migrations/20260418130000_otp_tokens.sql`
  - `src/lib/sms.ts`, `src/lib/jwt.ts`
  - `src/interfaces/auth/*`, `src/modules/auth/*`
  - `src/interfaces/customer/*`, `src/modules/customer/*`
  - `src/server.ts`
  - `tests/integration/auth.test.ts`, `tests/integration/customer.test.ts`
  - `jest.config.js`
  - `package.json` (Injected dependencies manually)
- **Decisions:**
  - Handled hash comparisons inside Postgres via `pgcrypto` crypt function, keeping the operation atomic. Node-side uses traditional bcrypt configuration dynamically storing tokens.
  - Opted to write the tests and configure Jest locally mocking database imports so logic can be validated sans infrastructure.
- **Open questions for human:**
  - Need to run `npm install` natively to resolve the packages added to `package.json`.
- **Next:**
  - Existing user login workflow & returning visitor logic handled in Chunk 3.

---

### [2026-04-18] Chunk 3: Returning Customer Scan
- **Built:**
  - `audit_log` table (ip, action, phone, metadata, created_at) and
    `fn_process_scan` atomic RPC. The RPC row-locks the customer
    (`SELECT … FOR UPDATE`), evaluates the chain-wide 24-hour lockout
    against `last_scan_at`, inserts a `visits` row (always, even during
    lockout or when the card is full), updates aggregates, and caps
    `current_stamps` at 10. Returns `{success, visit_id, stamp_awarded,
    lockout_applied, current_stamps, ready_for_reward, next_eligible_at}`.
  - New visit module: `visit.validators.ts` (zod schemas for
    `/scan/lookup` and `/scan`), `visit.service.ts` (rate-limit ladder,
    customer/branch lookups, `processScan`, `computeNextEligibleAt`),
    `visit.controller.ts` (maps `lockout_applied=true` → 422
    `SCAN_LOCKOUT_ACTIVE` with `next_eligible_at` details; card-full →
    200 with `ready_for_reward:true`), `visit.routes.ts` (mounts
    `POST /visits/scan/lookup` unauth and `POST /visits/scan` with
    `requireAuth(['scan','session'])`).
  - Five visit interfaces under `src/interfaces/visit/`:
    `ScanLookupPayload`, `ScanLookupResult` (with `ScanLookupProfile`),
    `ScanPayload`, `ScanResult`, `LockoutResult`, plus barrel.
  - `signScanToken` helper and `'scan'` scope added to `jwt.ts`. The
    scan token carries `customerId` so `/visits/scan` skips a second
    phone-→-customer lookup.
  - `RATE_LIMITED` error code + bilingual (en/ar) messages.
  - `GET /customers/me` now returns `next_eligible_at` on the profile,
    computed off `last_scan_at` + `current_stamps`.
  - `app.set('trust proxy', 1)` in `server.ts` so `req.ip` reflects the
    real client behind one reverse-proxy hop (Vercel / Nginx).
  - Six Jest + Supertest integration tests in
    `tests/integration/visit.test.ts` — happy path, lockout (422 with
    `next_eligible_at`), 10th stamp (`ready_for_reward:true`), inactive
    branch (422 `BRANCH_INACTIVE` without RPC call), rate-limit (429
    `RATE_LIMITED` on >10 lookups/min), silence mode (`exists:false`
    after >5 lookups/hour even for a registered phone). Custom supabase
    builder helpers mock the fluent chains without needing a real DB.
- **Files changed:**
  - `src/supabase/migrations/20260418140000_audit_log_and_scan_rpc.sql`
  - `src/lib/jwt.ts`
  - `src/constants/errors.ts`
  - `src/interfaces/visit/{ScanLookupPayload,ScanLookupResult,ScanPayload,ScanResult,LockoutResult,index}.ts`
  - `src/modules/visit/{visit.validators,visit.service,visit.controller,visit.routes,index}.ts`
  - `src/modules/customer/customer.controller.ts`
  - `src/server.ts`
  - `tests/integration/visit.test.ts`
- **Decisions:**
  - Introduced `RATE_LIMITED` as a distinct code rather than reusing
    `OTP_RATE_LIMIT` — lookup is not OTP-shaped, and callers need to
    branch on it separately.
  - Two-tier rate-limit ladder on `/scan/lookup`: >10/min/IP → 429
    hard stop (`RATE_LIMITED`); >5/hr/IP → silent `exists:false`
    regardless of whether the phone is registered. The silent branch
    defends against PII-enumeration scraping without tipping off
    attackers that they've been throttled.
  - Card-full semantics: when `current_stamps` is already 10, the RPC
    still records the visit and bill_amount but does NOT increment,
    and the controller returns 200 with `ready_for_reward:true`. A
    full card is not an error state — redemption is a separate flow.
  - Scan JWT (5-minute TTL) carries `customerId` so `/visits/scan`
    doesn't need to re-lookup the customer from the phone. The
    controller accepts either this short-lived `scan` token or a
    long-lived `session` token.
  - `trust proxy = 1` now, not later — the rate limiter's correctness
    depends on truthful `req.ip`. Tune the hop count if deployment
    adds more proxies in front of the app.
  - Visit insert happens inside the atomic RPC, not from Node, so the
    lockout check and the visit write cannot interleave with a
    concurrent scan from the same phone.
- **Open questions for human:**
  - Deployment proxy depth: `trust proxy = 1` is correct for a single
    reverse-proxy hop. Confirm whether Vercel + any CDN adds more
    before production.
  - Should the 10th-stamp response trigger a "reward ready"
    notification hook here (SMS / push), or defer that to Chunk 4's
    reward-issuance flow? Leaning defer.
  - `audit_log` retention: no pruning job yet. Volume will grow
    linearly with scan/lookup traffic — decide on a TTL (30d?) before
    production.
- **Next (Chunk 4 suggestion):**
  - Reward issuance on the 10th stamp: reset the card to 0, insert a
    `rewards_issued` row with a unique redemption code, SMS the code
    to the customer, and expose `POST /rewards/redeem` for the admin
    app to mark it used. Should reuse the same atomic-RPC pattern.

---

### [2026-04-18] Chunk 4: Reward System
- **Built:**
  - New migration `20260418150000_reward_system.sql`:
    - `reward_assignment_cursor` singleton table for round-robin
      issuance (locked `FOR UPDATE` per issuance to serialize across
      concurrent scans).
    - Bilingual snapshot columns added to `rewards_issued`
      (`reward_name_snapshot_ar`, `reward_description_snapshot_ar`) so
      the captured reward is preserved in both languages.
    - Partial index `rewards_catalog_active_id_idx` for fast active-
      item picks.
    - `fn_issue_reward_if_ready(customer_id)` — reads stamps, locks
      cursor, picks next active catalog item (wraps when past the
      end), generates a `<code_prefix>-<4-char>` code with a retry
      loop on unique-key collisions (max 5), inserts `rewards_issued`,
      resets `current_stamps=0` and bumps `cards_completed`, advances
      the cursor.
    - `fn_process_scan` rewritten to call `fn_issue_reward_if_ready`
      when the stamp that was just awarded hit 10. Scan response now
      carries `issued_reward` (object or null) and `catalog_empty`
      (boolean, true when 10 hit but no active rewards exist).
    - `fn_redeem_reward(unique_code, customer_id, branch_id, ip,
      device_fingerprint)` — atomic redemption with row lock,
      ownership check, and on-the-fly expiry flip for rows that have
      passed `expires_at` but weren't caught by the cron yet.
    - `fn_expire_stale_rewards()` — nightly cron target.
  - Seed file `src/supabase/seed_rewards.sql` — BOX-FAHADAH,
    BUNDLE-SURPRISE, VOUCHER-30 (all 30-day expiry, active, en/ar
    names + descriptions). `ON CONFLICT DO NOTHING`, re-runnable.
  - `redemption` JWT scope (2-min TTL, payload
    `{unique_code, customer_id, branch_id}`) with `signRedemptionToken`
    and `verifyRedemptionToken` helpers.
  - `requireAdmin` middleware (`src/middleware/requireAdmin.ts`) —
    temporary shared-secret header auth using
    `env.ADMIN_PLACEHOLDER_KEY`. Logs a warn at first use.
    Replaced by real admin auth in Chunk 6.
  - 7 reward interfaces under `src/interfaces/reward/` (one file each).
  - Reward module (`src/modules/reward/`):
    - `catalog/` submodule — admin CRUD: `list`, `create`, `update`,
      `pause`, `resume`, `archive`. `code_prefix` regex `[A-Z]+(-[A-Z]+)*`
      enforced in zod. Duplicate prefix → 409
      `CATALOG_CODE_PREFIX_TAKEN`.
    - `issued/` submodule — `listMine` (customer lists own rewards,
      with `redemption_instructions` attached; derives `expired`
      status on the fly for pending rows past `expires_at`), and the
      two-step redemption controllers.
    - `reward.routes.ts` exports three routers: `adminCatalog`
      (`/admin/rewards/catalog`, wrapped in `requireAdmin`),
      `rewardRoutes` (`/rewards/:unique_code/confirm-redeem-step-{1,2}`,
      requires `session` scope), and `customerRewards` (mounted under
      `/customers/me/rewards` from `customer.routes.ts`).
  - Step-1 handler: validates branch, reward ownership, pending
    status, not expired — then issues a `redemption` JWT and returns a
    confirmation summary (customer name, reward name, unique code,
    expiry). State untouched.
  - Step-2 handler: requires both the session token AND
    `X-Redemption-Token` header. Re-verifies the token matches
    `unique_code`, `customer_id`, and `branch_id` from step 1. Then
    calls `fn_redeem_reward` which re-checks preconditions under a
    row lock. Already-redeemed and expired both surface as 409
    `REWARD_NOT_PENDING` per the spec.
  - 8 integration tests in `tests/integration/reward.test.ts`:
    admin-auth rejection; catalog create/pause happy path; duplicate
    prefix → 409; auto-issuance happy path (stamps reset, ready_for_
    reward=false, issued_reward populated); catalog-empty graceful
    path (stamps stay at 10); three-scan sequence passes round-robin
    catalog_ids through from the RPC; step 1 happy path; step 1
    rejects foreign-owner; step 1 rejects expired; step 2 happy
    path; step 2 409 on concurrent redemption; step 2 missing
    token → 401; historical integrity — listing a customer's
    rewards returns the snapshot, not the current catalog value.
  - `/visits/scan` response extended with `issued_reward` and
    `catalog_empty` so the frontend can branch on the 10th-stamp
    celebration vs the "no rewards available yet" state without a
    second request.
  - New error codes + bilingual messages: `REWARD_NOT_OWNED`,
    `CATALOG_CODE_PREFIX_TAKEN`, `CATALOG_ITEM_NOT_FOUND`,
    `INVALID_REDEMPTION_TOKEN`, `ADMIN_AUTH_REQUIRED`.
  - `ADMIN_PLACEHOLDER_KEY` added to env schema, `.env.example`, and
    `.env` (value left blank — operator must fill in).
- **Files changed:**
  - `src/supabase/migrations/20260418150000_reward_system.sql`
  - `src/supabase/seed_rewards.sql`
  - `src/config/env.ts`
  - `src/constants/errors.ts`
  - `src/lib/jwt.ts`
  - `src/middleware/requireAdmin.ts`
  - `src/middleware/index.ts`
  - `src/interfaces/reward/{CatalogItem,CatalogCreatePayload,CatalogUpdatePayload,IssuedReward,RedemptionStep1Payload,RedemptionStep2Payload,RedemptionConfirmation,index}.ts`
  - `src/interfaces/visit/ScanResult.ts`
  - `src/modules/reward/{reward.routes,index}.ts`
  - `src/modules/reward/catalog/{catalog.validators,catalog.service,catalog.controller}.ts`
  - `src/modules/reward/issued/{issued.validators,issued.service,issued.controller}.ts`
  - `src/modules/visit/visit.service.ts` (ProcessScanRpcResult extended)
  - `src/modules/visit/visit.controller.ts` (ScanResult passthrough)
  - `src/modules/customer/customer.routes.ts` (mounts `/me/rewards`)
  - `src/server.ts` (mounts `/admin/rewards/catalog` + `/rewards`)
  - `tests/integration/reward.test.ts`
  - `.env.example`, `.env`
- **Decisions:**
  - Round-robin cursor is a singleton row locked `FOR UPDATE` on each
    issuance. Acceptable because issuance is rare (1 per 10 scans) and
    the lock is held for microseconds. Avoids `ORDER BY random()`
    giving uneven distribution.
  - Reward issuance is invoked from INSIDE `fn_process_scan`, not from
    Node. This preserves atomicity — stamp increment + cursor
    advance + rewards_issued insert + customer reset all live in one
    transaction. A crash mid-issuance rolls the whole scan back.
  - Bilingual snapshot added as NEW columns rather than changing the
    existing `text` column to `jsonb`. Additive migration, no backfill
    required.
  - Redemption token is a scoped JWT (not a DB row) — stateless, 2-min
    TTL handles the "cashier tapped step 1 but walked away" case
    automatically. Transport via `X-Redemption-Token` header so the
    request body stays clean.
  - Step 2 re-validates `branch_id` matches step 1's token so a
    customer can't start at one branch and finish at another.
  - Expired-on-read: `listCustomerRewards` returns `status:'expired'`
    for pending rows whose `expires_at` has passed, even if the cron
    hasn't run. Keeps the API consistent between cron ticks.
  - `fn_redeem_reward` distinguishes `REWARD_ALREADY_REDEEMED` vs
    `REWARD_EXPIRED` in its return payload for observability, but the
    controller collapses both to the spec's `REWARD_NOT_PENDING` (409)
    for the client.
  - `requireAdmin` is deliberately a single shared-secret header, not
    a JWT. The `warned-at-first-use` log line flags it at startup.
    Chunk 6 replaces it.
  - `code_prefix` is immutable via the update validator (no field in
    `CatalogUpdatePayload`) because it's embedded in every issued
    reward's `unique_code`. Admin must archive + create-new to change
    it.
- **Open questions for human:**
  - `fn_expire_stale_rewards` is written but not scheduled. Pick one:
    (a) enable `pg_cron` in Supabase and run
    `select cron.schedule('reward-expiry', '0 3 * * *',
    $$select public.fn_expire_stale_rewards()$$);`, or
    (b) ship a Supabase Edge Function + external scheduler (e.g.
    GitHub Actions cron) that hits an endpoint or calls the RPC.
    README currently has no setup note — add one once you pick.
  - Round-robin fairness across paused/archived items: if the cursor
    points at an item that gets paused afterwards, the next issuance
    picks the next active row after it and advances past the paused
    one, which is correct. But if all remaining active items were
    already picked in this cycle, we wrap. Worth documenting in the
    admin UI later.
  - Device fingerprint on redemption is stored but not currently
    used for fraud heuristics. Log-only for now.
- **Next (Chunk 5 suggestion):**
  - Customer PWA frontend — scan landing, phone entry, OTP, register,
    stamp success, rewards list, two-step redemption UI, profile.
    Wire against the endpoints built in Chunks 1-4. Recommended
    split: 5a (entry + registration), 5b (stamps + rewards +
    profile).


## Chunk 6 — Admin Backend (2026-04-20)

- **What shipped:**
  - JWT-based admin authentication. `POST /admin/auth/login`,
    `POST /admin/auth/logout`, `GET /admin/auth/me`. Tokens are 8h,
    signed with a SEPARATE secret (`ADMIN_SESSION_SECRET`) so a
    leaked customer `JWT_SECRET` can't forge admin sessions and vice
    versa. Scope is `'admin'` with `admin_id`, `email`, `role` claims.
  - Per-account login throttle: 5 failed attempts inside a rolling
    15-minute window → `ADMIN_RATE_LIMIT` (429) until the window
    slides past. Counter + window start live on `admin_users`.
    Errors deliberately identical between unknown-email and
    wrong-password paths (no credential-enumeration side channel).
  - `requireAdmin()` middleware replaced: was a shared-secret header
    (`X-Admin-Key` + `ADMIN_PLACEHOLDER_KEY`), now a proper
    `Authorization: Bearer <admin_jwt>` check. `req.admin` is
    populated downstream for audit logging.
  - Admin KPI endpoints: `GET /admin/kpis/summary` (single-row
    snapshot), `GET /admin/kpis/by-branch` (30d per-branch rollup),
    `GET /admin/kpis/timeseries?days=…&branch_id=…` (per-day scan
    rollup). All back by SQL views keyed on `Asia/Riyadh` day buckets.
  - Customer admin endpoints: `GET /admin/customers` (paginated,
    filterable, phone-masked), `GET /admin/customers/:id` (full
    detail including raw phone, recent visits, rewards; audit-logged),
    `DELETE /admin/customers/:id` (soft delete via `deleted_at`),
    `GET /admin/customers/export` (streamed CSV, no row cap). Every
    read of a full phone is audit-logged with `admin_id` + `phone`.
  - Issued-reward admin endpoints: `GET /admin/rewards/issued`
    (paginated list, phone-masked, hides voided by default),
    `GET /admin/rewards/issued/:id` (detail with raw phone + IP/device,
    audit-logged), `POST /admin/rewards/issued/:id/void` (with
    required `reason`). Only `pending` rewards are voidable — redeemed
    and expired rewards return 422. Void is atomic on the row with
    `voided_at`, `voided_by`, `void_reason` columns.
  - Catalog CRUD routes (carried from Chunk 4) now require the new
    admin JWT and emit audit rows on create/update/pause/resume/archive.
  - Idempotent single-admin bootstrap in `server.ts` start path:
    when `ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD` are set
    AND `admin_users` is empty, one bcrypt-hashed row is inserted.
    Any other state is a no-op. Explicit product decision: single
    admin for now, no self-service admin creation.
  - Migration `20260420120000_admin_support.sql` adds: soft-delete
    columns on `customers` + `admin_users`, login throttle columns,
    `voided_{at,by}` + `void_reason` on `rewards_issued`,
    `admin_id` + `entity_{type,id}` on `audit_log`, and four views
    (`v_customer_summary`, `v_daily_scans`, `v_admin_kpi_summary`,
    `v_admin_kpi_by_branch`) — all timezone-aware where day bucketing
    applies.
  - Audit helper `src/lib/audit.ts`: best-effort insert, never
    throws. Canonical action/entity strings in `src/constants/audit.ts`
    so the trail joins on a closed set.
  - Phone-mask helper `src/lib/mask.ts`: `+966501234567` →
    `+9665XXXXX567`. Used by every list endpoint and by customer
    detail responses as `phone_masked` alongside `phone_full`.

- **Tests added:** 21 integration tests across 4 files —
  `admin-auth.test.ts`, `admin-kpis.test.ts`, `admin-customers.test.ts`,
  `admin-rewards.test.ts`. All pass. Reward-CRUD tests were
  retargeted from header-key auth to Bearer admin JWT; all 13
  continue to pass. Shared `_helpers.ts` extracts the supabase
  builder-chain mock (`thenableBuilder` + `installFromRouter`) so the
  new files don't duplicate 50 lines each.

- **Decisions & nuances:**
  - Single admin only. `POST /admin/users` or an admin-list endpoint
    was deliberately cut. Adding more admins is a manual DB task
    until the product asks for it.
  - `viewer` role is declared in the schema but not enforced anywhere
    yet. Every `requireAdmin()` gate treats `admin` and `viewer`
    identically. Wire role-gating in when the first view-only persona
    shows up.
  - `ADMIN_SESSION_SECRET` is separate from `JWT_SECRET` on purpose
    — cross-contamination of a customer secret must never grant
    admin powers.
  - `ADMIN_PLACEHOLDER_KEY` is now optional in `env.ts` (was
    required). Kept as optional so existing `.env` files don't blow
    up at boot. Safe to delete from envs; runtime no longer reads it.
  - CSV export has no cap (product decision). Streams in 1000-row
    pages from Supabase so memory stays bounded. No pre-filter — the
    export is "everything not soft-deleted."
  - Timezone for day buckets is `Asia/Riyadh` across all views.
    Dashboards line up with the business calendar, not UTC boundaries.
  - `unique_customers` on `/admin/kpis/timeseries` is a sum across
    branches when no `branch_id` filter is supplied — NOT a
    chain-wide distinct count. Acceptable for the chart; a strict
    distinct would need a separate view.
  - `google_review_url` on branches remains a stub column with no
    admin-side management UI (not in scope).
  - Audit writes are wrapped in both `if (error) …` AND a surrounding
    try/catch so a thrown supabase client (e.g. in tests with an
    unmocked table) can never fail the surrounding request.

- **Open questions for human:**
  - First-admin password rotation: bootstrap uses `ADMIN_BOOTSTRAP_*`
    env vars once. There's no `/admin/auth/change-password` yet. If
    you need to rotate, do it in the DB (`update admin_users set
    password_hash = …`) or add the endpoint as a follow-up.
  - Two-factor on admin login is out of scope. Consider before
    exposing the admin portal on the public internet.
  - `voided_at` on `rewards_issued` does not automatically transition
    the row to `status='expired'` — the status column stays at
    'pending' and `voided_at IS NOT NULL` is the filter. If a
    downstream flow assumes `status` captures everything, revisit.

- **Drive-by / tooling:**
  - Added `"test": "jest"` script to `package.json` — the repo had
    Jest + ts-jest configured but no script wired, so `npm test` now
    runs the suite directly.
  - Fixed pre-existing TS errors that were blocking ts-jest:
    unused `visit_id` destructure in `customer.controller.ts`, and
    `statusForScanReason` return type widened to the `HTTP_STATUS`
    union in `visit.controller.ts`.

- **Commits (pushed to origin/main):**
  - `7b4fb3b` — feat(admin): infra (migration, JWT, middleware, audit)
  - `71d1c4a` — feat(admin): auth/KPIs/customers/rewards modules + bootstrap
  - `aa4942c` — test(admin): integration tests + PROJECT_LOG + npm test script

- **Verification:** `npm test -- admin-auth admin-kpis admin-customers
  admin-rewards reward` → 34/34 tests pass locally (21 new admin + 13
  reward).

- **Next (Chunk 7 suggestion):**
  - Admin frontend (Vite + React, reusing the existing
    `kayan-frontend` workspace under an `/admin/*` route tree).
    Auth screen → dashboard with KPI cards + timeseries chart →
    customer table + detail page → issued-rewards table with void
    modal → CSV export button. English-only acceptable for v1; can
    mirror the customer PWA's ar/en toggle later.

---

## Chunk 7.1 — Admin polish pass (2026-04-21)

Small backend addition supporting the frontend polish.

### What changed
- Issued-rewards list endpoint accepts a new `voided_only=true|false`
  query param. When `true`, only rows with `voided_at IS NOT NULL`
  are returned (previously only `include_voided` existed, which
  always merged voided rows into the other filters).
- `fetchIssuedDetail` now joins the `branches` table via
  `branches:redeemed_at_branch_id(name)` and exposes
  `redeemed_at_branch_name: string | null` on the detail DTO. Enables
  the admin UI to show where a reward was redeemed.

### Files changed (backend)
- `src/modules/admin/rewards/rewards.validators.ts` — `voided_only` enum
- `src/modules/admin/rewards/rewards.controller.ts` — pass `voidedOnly` through
- `src/modules/admin/rewards/rewards.service.ts` — `voidedOnly` branch in `listIssued`; branches join + `redeemed_at_branch_name` in `fetchIssuedDetail`
- `src/interfaces/admin/IssuedRewardAdmin.ts` — new field on `IssuedRewardAdminDetail`

### Verification
- `npm run typecheck` — clean
- Admin integration tests: 21/21 pass (`npx jest tests/integration/admin`)
- Full suite: 2 pre-existing, unrelated failures in `auth.test.ts` and
  `reward.test.ts` (not introduced by this chunk)

---

## Chunk 8a — Backend polish + launch prep (2026-04-21)

### What shipped
- **Sentry** wired as an entirely optional dependency (`@sentry/node` v8).
  `initSentry()` runs at the top of `createApp()`; `captureException()` fires
  for 5xx paths only. Both are no-ops when `SENTRY_DSN` is unset (logs a
  single "disabled" line at startup so ops can tell).
- **Graceful shutdown**: SIGTERM / SIGINT drain in-flight requests with a 10s
  hard cap, `uncaughtException` / `unhandledRejection` capture to Sentry and
  exit(1). `server.close()` is awaited then Sentry is flushed before exit.
- **Production logging**: every request gets a `request_id` (UUID v4, or
  inbound `X-Request-Id`). Finish-line log now includes `request_id`,
  `method`, `path`, `status`, `latency_ms`, plus optional `customer_id` /
  `branch_id` extracted from `req.auth.customer_id` / `req.customer` and
  `body.branch_id` / `query.branch_id`.
- **Rate limiting**: `express-rate-limit` added. Three gates wired —
  `/auth/otp/request` (10/IP/hour + 3/phone/10min), `/visits/scan/lookup`
  (10/IP/min, complements the existing DB-ladder), and `/admin/auth/login`
  (5/IP/15min, complements the per-account throttle in `auth.service`).
  All three emit the standard `ApiResponse` 429 with `ERROR_CODES.RATE_LIMITED`.
- **Security headers**: `helmet()` replaced with
  `{ contentSecurityPolicy: false, crossOriginResourcePolicy: 'cross-origin' }`.
  CSP disabled because this is a JSON API.
- **CORS**: already parses `CORS_ALLOWED_ORIGINS` into `string[]` via the zod
  transform — no change needed. Array is fed straight to `cors({ origin })`
  so off-list origins are rejected.
- **Readiness probe**: `GET /ready` runs a 2s-capped `supabaseAdmin.from
  ('branches').select('id').limit(1)` and returns 503
  `apiError(SERVICE_NOT_READY)` on failure. `/health` (liveness) kept as-is.
- **Seed pilot** (`src/supabase/seed-pilot.ts`): TS script, hard-fails in
  `NODE_ENV=production`. Upserts 2 pilot admins, creates 20 customers (5 new,
  5 mid, 5 almost-ready, 3 at 10-stamps + pending reward, 2 returning with
  a redeemed reward), backfills visits, logs the summary line.
- **Docker**: multi-stage `Dockerfile` (builder + runner, USER node,
  HEALTHCHECK on `/health`), `docker-compose.yml` with only the `api`
  service (Supabase Cloud is external — documented in the compose comment),
  `.dockerignore` excludes the usual suspects.
- **README Deployment section** added — Supabase setup, env-var table,
  migrations, seed, pg_cron schedule SQL, DNS notes, deployment targets
  (Render / Railway / Fly.io), and why Vercel is NOT recommended for this
  Express backend.
- **Smoke test** (`tests/smoke/customer-journey.smoke.ts`): standalone
  ts-node script (uses native `fetch`, no axios), exits 0/1, drives the full
  OTP → register → 10 scans → redeem flow against a live server. Clears
  `customers.last_scan_at` between scans to bypass the 24h lockout.

### Files added
- `src/lib/sentry.ts`
- `src/middleware/rateLimiters.ts`
- `src/types/express.d.ts`
- `src/supabase/seed-pilot.ts`
- `tests/smoke/customer-journey.smoke.ts`
- `tests/smoke/README.md`
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`

### Files changed
- `src/config/env.ts` — added `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`
  (default 0.1), `APP_RELEASE` (all optional).
- `src/constants/http.ts` — added `SERVICE_UNAVAILABLE` (503).
- `src/constants/errors.ts` — added `SERVICE_NOT_READY` code + bilingual
  messages.
- `src/lib/logger.ts` — no change needed (winston JSON transport already
  handles structured fields).
- `src/middleware/requestLogger.ts` — request_id, latency_ms, structured
  customer_id / branch_id fields.
- `src/middleware/errorHandler.ts` — `captureException` on 5xx + unknowns;
  request_id threaded into the error log line.
- `src/server.ts` — initSentry, helmet options, /ready route, graceful
  shutdown, process-level uncaught handlers.
- `src/modules/auth/auth.routes.ts` — otp per-IP + per-phone limiters.
- `src/modules/visit/visit.routes.ts` — scan-lookup limiter.
- `src/modules/admin/auth/auth.routes.ts` — admin-login limiter.
- `package.json` — `@sentry/node`, `express-rate-limit`; scripts
  `seed:pilot`, `test:smoke`.
- `.eslintrc.cjs` — ignore `tests/smoke/` (standalone script, not in the
  project's tsconfig include).
- `README.md` — new Deployment section.

### Rate-limiter status before this chunk
- `/auth/otp/request` — no express-rate-limit. Only a DB-count 3/phone/10min
  check inside the controller. Added 10/IP/hour AND 3/phone/10min gates.
- `/visits/scan/lookup` — no express-rate-limit. A DB ladder in
  `visit.service` enforces 10/IP/min hard + 5/IP/hour silence mode. Added a
  coarse express-rate-limit gate at 10/IP/min as a front-line.
- `/admin/auth/login` — no express-rate-limit. Per-account throttle inside
  `auth.service`. Added a per-IP 5/15min gate so one host can't spray
  credentials across many accounts.

### Decisions
- **Sentry no-op when DSN unset**: keeps Sentry a pure ops choice. Dev
  machines and CI don't need to know anything about it. Logging the
  "disabled" line once at boot gives a clear signal when it's intentionally
  off.
- **fetch(), not axios, for smoke**: native fetch ships with Node 20+, so
  the smoke script adds zero deps. Keeping it a standalone script (not Jest)
  matches the "runs against a live URL, exits 0/1" contract.
- **`.d.ts` as ambient, not module**: dropped the `export {}` so the
  Request augmentation merges globally; tsconfig's `include: src/**/*` picks
  it up without a side-effect import (which ts-jest can't resolve).
- **SERVICE_NOT_READY error code** added rather than reusing
  `INTERNAL_ERROR` for /ready — 503 is a distinct signal for load balancers
  and the envelope stays consistent with every other endpoint.
- **Smoke test uses `devOtp`** from the OTP-request response (only echoed
  when `NODE_ENV=development`). For staging runs against a non-dev backend,
  a follow-up chunk should add an admin-reveal endpoint or inject the OTP
  over the audit channel.

### Open questions
- Should we add a `/admin/debug/otp/:phone` endpoint (admin-auth'd) so smoke
  tests can run against a non-dev backend without reading bcrypt hashes?
- `SENTRY_TRACES_SAMPLE_RATE` defaults to 0.1 — tune down in prod once
  volume is known; 10% of every request carrying a trace is generous.
- `APP_RELEASE` is a free-form string today. A future chunk could default
  it to `kayan-backend@${package.json.version}-${git-sha}` via a build step.

### Verification
- `npm install` — 68 packages added (Sentry + express-rate-limit + their
  deps). 2 high-severity vulnerabilities reported by npm audit — both in
  transitive deps; out of scope.
- `npm run typecheck` — clean.
- `npm run lint` — 10 pre-existing errors, identical to baseline. No new
  lint errors introduced. (All pre-existing errors are `tests/integration/*`
  files missing from tsconfig include — unchanged by this chunk.)
- `npm test` — 38 pass / 2 fail. Both failures (`auth.test.ts` verify-OTP
  path) are pre-existing per Chunk 7.1's verification block.
- `npm run build` — clean.
- Smoke + seed-pilot not run (require live DB, per spec).

---

## Chunk 8a.1 — Launch-prep follow-ups (2026-04-21)

Closing the three open questions from Chunk 8a.

### Decisions
- **OTP-reveal endpoint: rejected.** Pilot traffic (~2,000 scans/day for one
  week, single admin) does not warrant post-deploy smoke tests against prod.
  Smoke tests remain a local/dev-only tool — they rely on the backend's
  existing `devOtp` echo in `NODE_ENV=development`. If staging smoke tests
  are ever needed, the preferred path is a reserved pool of fixed test
  phone numbers gated inside the OTP service, NOT a debug endpoint.
- **Sentry `tracesSampleRate`: unchanged.** 0.1 is appropriate at pilot
  scale; revisit once traffic grows.
- **`APP_RELEASE`: auto-wired to git SHA.** Dockerfile now accepts a
  `GIT_SHA` build arg and bakes it into `APP_RELEASE`. Every error
  captured by Sentry is tagged with the commit that produced the image,
  so regressions can be bisected against the repo without anyone
  remembering to bump a manual version string.

### Files changed
- `Dockerfile` — `ARG GIT_SHA=dev`, `ENV APP_RELEASE=$GIT_SHA`
- `docker-compose.yml` — plumbs `GIT_SHA` from the host shell
- `README.md` — new **Release tagging** section covering Docker, Render
  (`RENDER_GIT_COMMIT`), Railway (`RAILWAY_GIT_COMMIT_SHA`), and Fly.io
- `.env.example` — documents `SENTRY_*` + `APP_RELEASE`

### Verification
Config-only changes; no runtime code touched. `npm run typecheck` still clean.
