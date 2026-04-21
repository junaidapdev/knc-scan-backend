# Smoke tests

These tests hit a **running server** over HTTP — they do not use the Express
app in-memory. The goal is a fast end-to-end check that proves the whole
customer journey works against a real (pilot / staging) Supabase.

## Prereqs

- A running backend (`npm run dev` or a deployed URL).
- A **fresh** Supabase project, or one that has just been re-seeded via
  `npm run seed:pilot`. The tests create state and clean up after themselves,
  but they assume at least one active branch exists.

## Running

```bash
# Defaults to http://localhost:3000
npm run test:smoke

# Override the target
API_URL=https://api-staging.kayansweets.com npm run test:smoke
```

The script exits `0` on pass and `1` on fail. Each step is logged.

## What it does

1. Requests an OTP for a canary phone.
2. Reads the OTP directly from the `otp_tokens` table via `supabaseAdmin`
   (the DB row is the source of truth; dev mode also returns `devOtp` in the
   response for convenience).
3. Verifies the OTP, registers a new customer, and drives ten consecutive
   scans against a seeded branch. Between scans the script clears
   `customers.last_scan_at` so the 24h lockout doesn't interfere.
4. Expects the tenth scan to issue a reward.
5. Redeems the reward via the two-step confirmation flow.
6. Cleans up — deletes the customer, their visits, and the issued reward.

If any step fails the full response payload is logged and the process exits
with code `1`.
