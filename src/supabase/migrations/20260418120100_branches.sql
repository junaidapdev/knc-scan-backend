-- Chunk 1 Migration 01: branches
-- 11 Kayan Sweets locations. qr_identifier is the printed-at-counter code the
-- customer scans. See seed.sql for initial rows.

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  qr_identifier text not null unique,
  google_review_url text,
  carries_boxed_chocolates boolean not null default false,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Most branch queries filter on active = true; partial index keeps it compact.
create index branches_active_idx on public.branches (active) where active = true;

alter table public.branches enable row level security;

comment on table public.branches is 'Physical Kayan Sweets locations.';
comment on column public.branches.qr_identifier is 'Printable code scanned by customers at checkout.';
comment on column public.branches.carries_boxed_chocolates is 'Whether this branch stocks the packaged chocolate SKUs (subset of catalog).';
