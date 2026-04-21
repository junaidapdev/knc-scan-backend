-- Chunk 1 Migration 07: sms_log
-- Audit trail of outbound SMS (primarily OTPs). Service-role writes only; no
-- client reads.

create table public.sms_log (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^\+[1-9]\d{6,14}$'),
  purpose text not null default 'otp',
  sent_at timestamptz not null default now(),
  status text not null check (status in ('sent', 'delivered', 'failed')),
  provider_reference text
);

create index sms_log_phone_sent_idx on public.sms_log (phone, sent_at desc);
create index sms_log_status_idx on public.sms_log (status);

alter table public.sms_log enable row level security;

comment on table public.sms_log is 'SMS audit trail. No client policies — service role bypasses RLS.';
