-- Chunk 1 Migration 08: feedback
-- Post-visit ratings. type='public' may be forwarded to Google reviews; 'private'
-- stays internal.

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  rating int not null check (rating between 1 and 5),
  type text not null check (type in ('public', 'private')),
  text text,
  created_at timestamptz not null default now()
);

create index feedback_customer_id_idx on public.feedback (customer_id);
create index feedback_branch_id_idx on public.feedback (branch_id);
create index feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

comment on table public.feedback is 'Post-visit customer ratings. Public ratings may be surfaced to Google review flow.';
