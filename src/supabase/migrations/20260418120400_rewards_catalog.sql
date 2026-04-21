-- Chunk 1 Migration 04: rewards_catalog
-- Template/master list of rewards. rewards_issued snapshots these values at
-- issuance time so catalog edits never change in-flight rewards.

create table public.rewards_catalog (
  id uuid primary key default gen_random_uuid(),
  code_prefix text not null unique,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  image_url text,
  estimated_value_sar numeric(10, 2) not null check (estimated_value_sar >= 0),
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  default_expiry_days int not null default 30 check (default_expiry_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rewards_catalog_status_idx on public.rewards_catalog (status);

alter table public.rewards_catalog enable row level security;

-- Auto-bump updated_at on any row change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger rewards_catalog_set_updated_at
  before update on public.rewards_catalog
  for each row
  execute function public.set_updated_at();

comment on table public.rewards_catalog is 'Master list of redeemable rewards. Issued rewards snapshot these fields.';
comment on column public.rewards_catalog.code_prefix is 'Short code used to build unique_code on rewards_issued (e.g. BOX10).';
