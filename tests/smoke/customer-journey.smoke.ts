/* eslint-disable no-console */
// End-to-end smoke test for the customer journey. Hits a running server via
// fetch() — this is deliberately NOT a jest test. Run it manually against a
// fresh pilot/staging Supabase.
//
// Usage:
//   API_URL=http://localhost:3000 npm run test:smoke
//
// Exit codes:
//   0 — all steps passed
//   1 — any step failed (full payload logged)

import { supabaseAdmin } from '@/lib/supabase';

const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const SMOKE_PHONE = '+966500999001';
const SMOKE_NAME = 'Smoke Test';

interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}
interface ApiFailureEnvelope {
  success: false;
  error: { code: string; message: unknown; details?: unknown };
}
type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiFailureEnvelope;

function log(step: string, message: string, extra?: unknown): void {
  const suffix = extra === undefined ? '' : ` ${JSON.stringify(extra)}`;
  console.log(`[smoke] ${step}: ${message}${suffix}`);
}

function fail(step: string, message: string, extra?: unknown): never {
  const suffix = extra === undefined ? '' : ` ${JSON.stringify(extra)}`;
  console.error(`[smoke] ${step} FAILED: ${message}${suffix}`);
  process.exit(1);
}

async function callApi<T>(
  step: string,
  method: string,
  path: string,
  opts: { body?: unknown; bearer?: string; headers?: Record<string, string> } = {},
): Promise<T> {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(opts.headers ?? {}),
  };
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  const res = await fetch(url, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const payload = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !payload || payload.success === false) {
    fail(step, `HTTP ${res.status}`, payload);
  }
  return (payload as ApiSuccessEnvelope<T>).data;
}

interface OtpRequestData {
  message: string;
  devOtp?: string;
}

async function readOtpFromDb(phone: string): Promise<string> {
  // Token is bcrypt-hashed in the DB so we can't read it back. Prefer the
  // devOtp echoed by the request response when NODE_ENV=development. For
  // staging / pilot runs where the backend doesn't echo, override via
  // SMOKE_OTP_OVERRIDE env or add a dev-only admin endpoint.
  //
  // This helper exists for the future case where an admin-only reveal
  // endpoint is added; today it simply confirms the row was written and
  // returns the bcrypt hash length so the caller can assert-on-existence.
  const { data, error } = await supabaseAdmin
    .from('otp_tokens')
    .select('id, phone, token_hash, created_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    fail('readOtpFromDb', 'no OTP row written for phone', { phone, error });
  }
  return ''; // unused — caller must rely on devOtp from request response
}

async function clearLockout(customerId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('customers')
    .update({ last_scan_at: null })
    .eq('id', customerId);
  if (error) fail('clearLockout', error.message);
}

async function fetchActiveBranchQr(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('branches')
    .select('qr_identifier')
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    fail('fetchActiveBranchQr', 'no active branch seeded', error);
  }
  return (data as { qr_identifier: string }).qr_identifier;
}

async function cleanup(phone: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();
  if (!data) return;
  const customerId = (data as { id: string }).id;
  await supabaseAdmin.from('visits').delete().eq('customer_id', customerId);
  await supabaseAdmin.from('rewards_issued').delete().eq('customer_id', customerId);
  await supabaseAdmin.from('customers').delete().eq('id', customerId);
  await supabaseAdmin.from('otp_tokens').delete().eq('phone', phone);
}

async function main(): Promise<void> {
  log('init', `targeting ${API_URL}`);

  // Pre-clean: if a prior failed run left state behind.
  await cleanup(SMOKE_PHONE);

  // Step 1 — request OTP.
  const otpReq = await callApi<OtpRequestData>('otp_request', 'POST', '/auth/otp/request', {
    body: { phone: SMOKE_PHONE },
  });
  log('otp_request', 'ok', { devOtp: otpReq.devOtp });
  await readOtpFromDb(SMOKE_PHONE); // assert DB row exists
  const otp = otpReq.devOtp;
  if (!otp) {
    fail('otp_request', 'backend did not echo devOtp — smoke test requires NODE_ENV=development on the target or an admin reveal endpoint');
  }

  // Step 2 — verify OTP.
  const verify = await callApi<{ token: string }>('otp_verify', 'POST', '/auth/otp/verify', {
    body: { phone: SMOKE_PHONE, otp },
  });
  log('otp_verify', 'ok');
  const registrationToken = verify.token;

  // Step 3 — register.
  const register = await callApi<{ token: string; customer: { id: string } }>(
    'register',
    'POST',
    '/customers/register',
    {
      body: { name: SMOKE_NAME, language: 'en', consent_marketing: false },
      bearer: registrationToken,
    },
  );
  log('register', 'ok', { customer_id: register.customer.id });
  const sessionToken = register.token;
  const customerId = register.customer.id;

  // Step 4 — 10 scans.
  const qr = await fetchActiveBranchQr();
  let issuedCode: string | null = null;
  for (let i = 1; i <= 10; i += 1) {
    await clearLockout(customerId);
    await callApi('scan_lookup', 'POST', '/visits/scan/lookup', {
      body: { phone: SMOKE_PHONE },
    });
    interface ScanData {
      current_stamps?: number;
      issued_reward?: { unique_code: string } | null;
    }
    const scan = await callApi<ScanData>('scan', 'POST', '/visits/scan', {
      body: { branch_qr_identifier: qr, bill_amount: 100 },
      bearer: sessionToken,
    });
    log('scan', `#${i}`, {
      current_stamps: scan.current_stamps,
      issued: Boolean(scan.issued_reward),
    });
    if (i === 10 && scan.issued_reward) {
      issuedCode = scan.issued_reward.unique_code;
    }
  }
  if (!issuedCode) fail('scan_10', 'issued_reward missing after 10th scan');

  // Step 5 — redemption two-step.
  const step1 = await callApi<{ redemption_token: string }>(
    'redeem_step_1',
    'POST',
    `/rewards/${issuedCode}/confirm-redeem-step-1`,
    {
      body: { branch_qr_identifier: qr },
      bearer: sessionToken,
    },
  );
  log('redeem_step_1', 'ok');

  await callApi('redeem_step_2', 'POST', `/rewards/${issuedCode}/confirm-redeem-step-2`, {
    body: { branch_qr_identifier: qr },
    bearer: sessionToken,
    headers: { 'x-redemption-token': step1.redemption_token },
  });
  log('redeem_step_2', 'ok');

  // Step 6 — cleanup.
  await cleanup(SMOKE_PHONE);
  log('cleanup', 'ok');

  log('done', 'all steps passed');
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[smoke] uncaught: ${msg}`);
  process.exit(1);
});
