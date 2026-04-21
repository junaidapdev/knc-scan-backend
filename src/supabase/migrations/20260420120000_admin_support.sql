-- Chunk 6 Migration: Admin support schema
--
-- Extends existing tables with admin-portal needs:
--   1) admin_users: soft delete + login throttle window columns.
--   2) customers: soft delete column + partial index.
--   3) rewards_issued: void support (voided_at, voided_by, void_reason).
--   4) audit_log: admin_id + entity_type/entity_id for richer admin trails.
-- Adds read-only KPI views keyed off Asia/Riyadh day buckets:
--   v_customer_summary, v_daily_scans, v_admin_kpi_summary, v_admin_kpi_by_branch.

-- ---------------------------------------------------------------------------
-- 1) admin_users additions
-- ---------------------------------------------------------------------------
alter table public.admin_users
  add column if not exists deleted_at timestamptz,
  add column if not exists login_attempt_count int not null default 0,
  add column if not exists login_attempt_window_start timestamptz;

comment on column public.admin_users.deleted_at is
  'Soft delete marker. Queries must filter WHERE deleted_at IS NULL.';
comment on column public.admin_users.login_attempt_count is
  'Rolling counter for failed logins; reset when window rolls over or on success.';
comment on column public.admin_users.login_attempt_window_start is
  'Start of the current throttling window. NULL when no failures recorded.';

-- ---------------------------------------------------------------------------
-- 2) customers soft delete
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists deleted_at timestamptz;

create index if not exists customers_deleted_at_idx
  on public.customers (deleted_at)
  where deleted_at is null;

comment on column public.customers.deleted_at is
  'Soft delete marker for PDPL erasure. Queries must filter WHERE deleted_at IS NULL.';

-- ---------------------------------------------------------------------------
-- 3) rewards_issued void support
-- ---------------------------------------------------------------------------
alter table public.rewards_issued
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.admin_users(id),
  add column if not exists void_reason text;

comment on column public.rewards_issued.voided_at is
  'Set when an admin forcibly invalidates a pending reward.';

-- ---------------------------------------------------------------------------
-- 4) audit_log admin context
-- ---------------------------------------------------------------------------
alter table public.audit_log
  add column if not exists admin_id uuid references public.admin_users(id),
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;

create index if not exists audit_log_admin_created_idx
  on public.audit_log (admin_id, created_at desc)
  where admin_id is not null;

create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, created_at desc)
  where entity_type is not null;

-- ---------------------------------------------------------------------------
-- 5) Views for KPI + customer summaries
--
-- All day-bucketed views use Asia/Riyadh so dashboards line up with the
-- business calendar.
-- ---------------------------------------------------------------------------

-- v_customer_summary: one row per non-deleted customer with issued/redeemed
-- counts joined in. Used by the admin customer list + detail views so they
-- don't have to do N+1 counts in application code.
create or replace view public.v_customer_summary as
select
  c.id,
  c.phone,
  c.name,
  c.language,
  c.tier,
  c.current_stamps,
  c.cards_completed,
  c.total_visits,
  c.total_self_reported_spend_sar,
  c.last_scan_at,
  c.preferred_branch_id,
  c.created_at,
  coalesce(ri.issued_count, 0) as rewards_issued_count,
  coalesce(ri.redeemed_count, 0) as rewards_redeemed_count,
  coalesce(ri.pending_count, 0) as rewards_pending_count
from public.customers c
left join (
  select
    customer_id,
    count(*) as issued_count,
    count(*) filter (where status = 'redeemed') as redeemed_count,
    count(*) filter (where status = 'pending' and voided_at is null) as pending_count
  from public.rewards_issued
  group by customer_id
) ri on ri.customer_id = c.id
where c.deleted_at is null;

comment on view public.v_customer_summary is
  'Per-customer rollup for the admin portal. Hides soft-deleted rows.';

-- v_daily_scans: scans/stamps/spend aggregated per Riyadh day. Timeseries
-- feed for KPI chart endpoints.
create or replace view public.v_daily_scans as
select
  (date_trunc('day', v.scanned_at at time zone 'Asia/Riyadh'))::date as scan_date,
  v.branch_id,
  count(*) as scans,
  count(*) filter (where v.stamp_awarded) as stamps_awarded,
  count(*) filter (where v.lockout_applied) as lockouts,
  coalesce(sum(v.bill_amount), 0) as total_bill_amount,
  count(distinct v.customer_id) as unique_customers
from public.visits v
group by 1, 2;

comment on view public.v_daily_scans is
  'Per-branch per-day scan rollup, bucketed in Asia/Riyadh.';

-- v_admin_kpi_summary: single-row current snapshot of program health.
-- SELECT * will return one row; callers can LIMIT 1 defensively.
create or replace view public.v_admin_kpi_summary as
select
  (select count(*) from public.customers where deleted_at is null) as total_customers,
  (select count(*) from public.customers
     where deleted_at is null and created_at >= now() - interval '30 days')
    as new_customers_30d,
  (select count(*) from public.visits
     where scanned_at >= now() - interval '30 days')
    as scans_30d,
  (select count(*) from public.visits
     where scanned_at >= now() - interval '30 days' and stamp_awarded)
    as stamps_30d,
  (select coalesce(sum(bill_amount), 0) from public.visits
     where scanned_at >= now() - interval '30 days')
    as spend_30d,
  (select count(*) from public.rewards_issued
     where issued_at >= now() - interval '30 days')
    as rewards_issued_30d,
  (select count(*) from public.rewards_issued
     where redeemed_at >= now() - interval '30 days' and status = 'redeemed')
    as rewards_redeemed_30d,
  (select count(*) from public.rewards_issued
     where status = 'pending' and voided_at is null)
    as rewards_outstanding,
  (select count(*) from public.branches where active) as active_branches;

comment on view public.v_admin_kpi_summary is
  'Single-row KPI snapshot. Values are all-time where unqualified, trailing 30d otherwise.';

-- v_admin_kpi_by_branch: trailing-30d rollup per branch, suitable for the
-- KPI by-branch endpoint. Includes inactive branches so they render as zero.
create or replace view public.v_admin_kpi_by_branch as
select
  b.id as branch_id,
  b.name as branch_name,
  b.city,
  b.active,
  coalesce((
    select count(*) from public.visits v
    where v.branch_id = b.id and v.scanned_at >= now() - interval '30 days'
  ), 0) as scans_30d,
  coalesce((
    select count(*) from public.visits v
    where v.branch_id = b.id
      and v.scanned_at >= now() - interval '30 days'
      and v.stamp_awarded
  ), 0) as stamps_30d,
  coalesce((
    select sum(v.bill_amount) from public.visits v
    where v.branch_id = b.id and v.scanned_at >= now() - interval '30 days'
  ), 0) as spend_30d,
  coalesce((
    select count(distinct v.customer_id) from public.visits v
    where v.branch_id = b.id and v.scanned_at >= now() - interval '30 days'
  ), 0) as unique_customers_30d
from public.branches b;

comment on view public.v_admin_kpi_by_branch is
  'Per-branch trailing-30d KPI rollup. Inactive branches included (zeros).';
