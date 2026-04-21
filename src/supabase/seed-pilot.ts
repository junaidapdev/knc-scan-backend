/* eslint-disable no-console */
// Seed-pilot is a dev/pilot-only script. It hard-fails in production before
// touching the DB. Run via `npm run seed:pilot`.

import bcrypt from 'bcrypt';
import crypto from 'crypto';

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { env } from '@/config/env';

const BCRYPT_ROUNDS = 10;
const PILOT_ADMIN_PASSWORD = 'KayanAdmin!2026';
const PILOT_ADMINS: ReadonlyArray<{ email: string; name: string }> = [
  { email: 'admin1@kayan.test', name: 'Pilot Admin 1' },
  { email: 'admin2@kayan.test', name: 'Pilot Admin 2' },
];

const SAUDI_NAMES: ReadonlyArray<string> = [
  'Ahmed Al-Saud',
  'Fatimah Al-Qahtani',
  'Mohammed Al-Ghamdi',
  'Nora Al-Harbi',
  'Khalid Al-Otaibi',
  'Sara Al-Zahrani',
  'Abdullah Al-Shehri',
  'Hessa Al-Dossary',
  'Faisal Al-Mutairi',
  'Maha Al-Rashid',
  'Yousef Al-Juhani',
  'Reem Al-Anazi',
  'Sultan Al-Balawi',
  'Aisha Al-Subaie',
  'Omar Al-Maliki',
  'Lamia Al-Qurashi',
  'Badr Al-Shammari',
  'Jawaher Al-Asiri',
  'Turki Al-Faifi',
  'Mona Al-Harthi',
];

interface VisitSpec {
  customerIndex: number;
  count: number;
  stampsAwarded: number;
}

function randomPhone(index: number): string {
  // +9665XXXXXXXX — 9-digit body starting with 5. Pad index into the last
  // segment so the numbers stay unique without a collision check.
  const body = String(900_000_000 + index * 37 + 1).padStart(9, '0').slice(-9);
  return `+9665${body.slice(0, 8)}`;
}

async function upsertAdmins(): Promise<number> {
  const hash = await bcrypt.hash(PILOT_ADMIN_PASSWORD, BCRYPT_ROUNDS);
  let inserted = 0;
  for (const admin of PILOT_ADMINS) {
    // Idempotent: upsert on the email unique key.
    const { error } = await supabaseAdmin
      .from('admin_users')
      .upsert(
        {
          email: admin.email,
          name: admin.name,
          role: 'admin',
          password_hash: hash,
        },
        { onConflict: 'email' },
      );
    if (error) {
      throw new Error(`Failed to upsert admin ${admin.email}: ${error.message}`);
    }
    inserted += 1;
  }
  return inserted;
}

async function fetchAnyBranchId(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('branches')
    .select('id')
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    throw new Error(
      `No active branch found — run migrations + base seed first. ${error?.message ?? ''}`,
    );
  }
  return (data as { id: string }).id;
}

interface CustomerPlan {
  name: string;
  phone: string;
  currentStamps: number;
  visitCount: number;
  issuePendingReward: boolean;
  issueRedeemedReward: boolean;
}

function buildCustomerPlans(): CustomerPlan[] {
  // 5 new (0-2 stamps), 5 mid (3-7), 5 almost-ready (8-9),
  // 3 at 10 stamps + pending reward, 2 returning (1 redeemed + low stamps).
  const plans: CustomerPlan[] = [];
  let nameCursor = 0;
  const nextName = (): string => {
    const n = SAUDI_NAMES[nameCursor % SAUDI_NAMES.length] ?? 'Guest';
    nameCursor += 1;
    return n;
  };

  // 5 new
  for (let i = 0; i < 5; i += 1) {
    const stamps = i % 3; // 0, 1, 2, 0, 1
    plans.push({
      name: nextName(),
      phone: randomPhone(plans.length),
      currentStamps: stamps,
      visitCount: stamps,
      issuePendingReward: false,
      issueRedeemedReward: false,
    });
  }
  // 5 mid
  for (let i = 0; i < 5; i += 1) {
    const stamps = 3 + (i % 5); // 3..7
    plans.push({
      name: nextName(),
      phone: randomPhone(plans.length),
      currentStamps: stamps,
      visitCount: stamps,
      issuePendingReward: false,
      issueRedeemedReward: false,
    });
  }
  // 5 almost-ready
  for (let i = 0; i < 5; i += 1) {
    const stamps = 8 + (i % 2); // 8 or 9
    plans.push({
      name: nextName(),
      phone: randomPhone(plans.length),
      currentStamps: stamps,
      visitCount: stamps,
      issuePendingReward: false,
      issueRedeemedReward: false,
    });
  }
  // 3 at 10 stamps + pending reward — after issuance the customer's
  // current_stamps resets to 0; here we leave stamps at 0 and mark the
  // pending-reward flag so the seed inserts a rewards_issued row.
  for (let i = 0; i < 3; i += 1) {
    plans.push({
      name: nextName(),
      phone: randomPhone(plans.length),
      currentStamps: 0,
      visitCount: 10,
      issuePendingReward: true,
      issueRedeemedReward: false,
    });
  }
  // 2 returning customers (redeemed reward + low current stamps)
  for (let i = 0; i < 2; i += 1) {
    plans.push({
      name: nextName(),
      phone: randomPhone(plans.length),
      currentStamps: 2 + i,
      visitCount: 12 + i,
      issuePendingReward: false,
      issueRedeemedReward: true,
    });
  }

  return plans;
}

async function ensureCustomer(
  plan: CustomerPlan,
): Promise<string> {
  // Upsert by phone — idempotent.
  const { data, error } = await supabaseAdmin
    .from('customers')
    .upsert(
      {
        phone: plan.phone,
        name: plan.name,
        language: 'ar',
        current_stamps: plan.currentStamps,
        total_visits: plan.visitCount,
      },
      { onConflict: 'phone' },
    )
    .select('id')
    .single();
  if (error || !data) {
    throw new Error(`Failed to upsert customer ${plan.phone}: ${error?.message}`);
  }
  return (data as { id: string }).id;
}

async function insertVisits(
  customerId: string,
  plan: CustomerPlan,
  branchId: string,
): Promise<number> {
  if (plan.visitCount === 0) return 0;
  const rows: VisitSpec[] = [];
  for (let i = 0; i < plan.visitCount; i += 1) rows.push({ customerIndex: i, count: plan.visitCount, stampsAwarded: 1 });

  const now = Date.now();
  const { error } = await supabaseAdmin.from('visits').insert(
    rows.map((_row, idx) => ({
      customer_id: customerId,
      branch_id: branchId,
      scanned_at: new Date(now - (plan.visitCount - idx) * 26 * 60 * 60 * 1000).toISOString(),
      stamp_awarded: true,
      lockout_applied: false,
      bill_amount: 75 + Math.floor(Math.random() * 150),
      bill_amount_source: 'self_reported',
    })),
  );
  if (error) throw new Error(`Failed to insert visits: ${error.message}`);
  return rows.length;
}

interface CatalogRow {
  id: string;
  code_prefix: string;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  default_expiry_days: number;
}

async function fetchActiveCatalog(): Promise<CatalogRow | null> {
  const { data, error } = await supabaseAdmin
    .from('rewards_catalog')
    .select('id, code_prefix, name_ar, name_en, description_ar, description_en, default_expiry_days')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to read rewards_catalog: ${error.message}`);
  return (data as CatalogRow | null) ?? null;
}

async function insertIssuedReward(
  customerId: string,
  catalog: CatalogRow,
  status: 'pending' | 'redeemed',
  branchId: string,
): Promise<void> {
  const uniqueCode = `${catalog.code_prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const expiresAt = new Date(Date.now() + catalog.default_expiry_days * 24 * 60 * 60 * 1000).toISOString();

  const row: Record<string, unknown> = {
    customer_id: customerId,
    catalog_id: catalog.id,
    unique_code: uniqueCode,
    reward_name_snapshot: catalog.name_en,
    reward_description_snapshot: catalog.description_en,
    expires_at: expiresAt,
    status,
  };
  if (status === 'redeemed') {
    row.redeemed_at = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    row.redeemed_at_branch_id = branchId;
  }

  const { error } = await supabaseAdmin.from('rewards_issued').insert(row);
  if (error) throw new Error(`Failed to insert issued reward: ${error.message}`);
}

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('seed-pilot refused to run in production');
  }

  logger.info('seed-pilot: starting', { node_env: env.NODE_ENV });

  const adminCount = await upsertAdmins();
  const branchId = await fetchAnyBranchId();
  const catalog = await fetchActiveCatalog();

  if (!catalog) {
    logger.warn('seed-pilot: no active rewards_catalog row found — reward seeding will be skipped');
  }

  const plans = buildCustomerPlans();
  let customerCount = 0;
  let visitCount = 0;
  let rewardCount = 0;

  for (const plan of plans) {
    const customerId = await ensureCustomer(plan);
    customerCount += 1;
    visitCount += await insertVisits(customerId, plan, branchId);

    if (plan.issuePendingReward && catalog) {
      await insertIssuedReward(customerId, catalog, 'pending', branchId);
      rewardCount += 1;
    }
    if (plan.issueRedeemedReward && catalog) {
      await insertIssuedReward(customerId, catalog, 'redeemed', branchId);
      rewardCount += 1;
    }
  }

  logger.info(
    `Seeded ${adminCount} admins, ${customerCount} customers, ${visitCount} visits, ${rewardCount} rewards`,
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error('seed-pilot failed', { message: msg });
  process.exit(1);
});
