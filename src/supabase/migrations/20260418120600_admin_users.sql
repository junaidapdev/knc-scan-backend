-- Chunk 1 Migration 06: admin_users
-- Staff accounts for the admin portal. RLS is on; no policies are defined,
-- so only the service role (server-side) can read/write this table.

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  password_hash text not null,
  name text not null,
  role text not null check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create index admin_users_role_idx on public.admin_users (role);

alter table public.admin_users enable row level security;

comment on table public.admin_users is 'Admin portal users. Not reachable from any client JWT — service role only.';
