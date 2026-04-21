-- Chunk 1 Migration 02: customers
-- Primary identity is phone (E.164). All customer-facing auth flows key off this.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^\+[1-9]\d{6,14}$'),
  name text,
  birthday_month int check (birthday_month between 1 and 12),
  birthday_day int check (birthday_day between 1 and 31),
  preferred_branch_id uuid references public.branches(id) on delete set null,
  language text not null default 'ar' check (language in ('ar', 'en')),
  consent_marketing boolean not null default false,
  created_at timestamptz not null default now(),
  last_scan_at timestamptz,
  total_visits int not null default 0 check (total_visits >= 0),
  current_stamps int not null default 0 check (current_stamps between 0 and 10),
  cards_completed int not null default 0 check (cards_completed >= 0),
  total_self_reported_spend_sar numeric(12, 2) not null default 0 check (total_self_reported_spend_sar >= 0),
  -- TODO: confirm full tier enumeration with product. Using a conservative set
  -- for V1 launch; expand via a follow-up migration if needed.
  tier text not null default 'standard' check (tier in ('standard', 'silver', 'gold')),
  lifetime_points int not null default 0 check (lifetime_points >= 0)
);

-- phone is already indexed via the UNIQUE constraint; no extra index needed.
create index customers_last_scan_at_idx on public.customers (last_scan_at desc);
create index customers_preferred_branch_id_idx on public.customers (preferred_branch_id);

alter table public.customers enable row level security;

comment on table public.customers is 'Loyalty program customers. Identity is E.164 phone number.';
comment on column public.customers.current_stamps is '0-10 stamps on the in-progress loyalty card. Capped by check constraint.';
comment on column public.customers.tier is 'Tier label. TODO: confirm final tier set with product.';
