-- Chunk 1 Migration 05: rewards_issued
-- Concrete reward instances belonging to a customer. Snapshots name/description
-- so catalog edits don't change already-issued rewards.

create table public.rewards_issued (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  catalog_id uuid not null references public.rewards_catalog(id) on delete restrict,
  unique_code text not null unique,
  reward_name_snapshot text not null,
  reward_description_snapshot text,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'redeemed', 'expired')),
  redeemed_at timestamptz,
  redeemed_at_branch_id uuid references public.branches(id) on delete set null,
  redemption_ip inet,
  redemption_device_fingerprint text,
  check (
    (status = 'redeemed' and redeemed_at is not null)
    or (status <> 'redeemed' and redeemed_at is null)
  )
);

create index rewards_issued_customer_id_idx on public.rewards_issued (customer_id);
create index rewards_issued_status_idx on public.rewards_issued (status);
-- unique_code already has an index from the UNIQUE constraint.

alter table public.rewards_issued enable row level security;

comment on table public.rewards_issued is 'Concrete reward entitlements. State machine: pending → redeemed | expired.';
comment on column public.rewards_issued.unique_code is 'Customer-presented code. Format: <code_prefix>-<suffix>.';
