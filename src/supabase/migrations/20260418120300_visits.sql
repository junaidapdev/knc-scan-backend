-- Chunk 1 Migration 03: visits
-- One row per successful scan. stamp_awarded = false when the lockout window
-- (see constants/business.ts STAMP_LOCKOUT_HOURS) suppresses the stamp.

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  scanned_at timestamptz not null default now(),
  stamp_awarded boolean not null default false,
  lockout_applied boolean not null default false,
  bill_amount numeric(10, 2) check (bill_amount is null or bill_amount >= 0),
  bill_amount_source text not null default 'self_reported'
    check (bill_amount_source in ('self_reported', 'pos')),
  device_fingerprint text,
  ip_address inet,
  points_awarded int not null default 0 check (points_awarded >= 0),
  receipt_code text
);

create index visits_customer_id_idx on public.visits (customer_id);
create index visits_branch_id_idx on public.visits (branch_id);
create index visits_scanned_at_idx on public.visits (scanned_at desc);
-- Composite helper for the common "latest visit for this customer" query
-- (used to enforce the 24h stamp lockout).
create index visits_customer_scanned_idx on public.visits (customer_id, scanned_at desc);

alter table public.visits enable row level security;

comment on table public.visits is 'Append-only log of customer scans. Stamps and points derive from these rows.';
comment on column public.visits.lockout_applied is 'True when a scan was accepted but no stamp was granted due to 24h lockout.';
