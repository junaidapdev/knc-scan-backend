-- Chunk 3 Migration: audit_log + fn_process_scan
--
-- Adds:
--  1) audit_log table — generic forensic trail for sensitive endpoints
--     (currently: scan_lookup). Service-role only; no client RLS policies.
--  2) fn_process_scan — atomic scan-processing RPC. Row-locks the customer,
--     computes chain-wide 24h lockout, inserts the visit, updates aggregates.

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  ip inet,
  action text not null,
  phone text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_ip_action_created_idx
  on public.audit_log (ip, action, created_at desc);
create index audit_log_action_created_idx
  on public.audit_log (action, created_at desc);

alter table public.audit_log enable row level security;
-- No policies: RLS + no grants = service-role only.

comment on table public.audit_log is
  'Forensic trail for sensitive endpoints (e.g. scan_lookup rate-limit tracking).';

-- ---------------------------------------------------------------------------
-- fn_process_scan
-- ---------------------------------------------------------------------------
-- Returns JSON:
--   success branch:
--     { success:true, visit_id, stamp_awarded, lockout_applied,
--       current_stamps, ready_for_reward, next_eligible_at }
--   failure branch:
--     { success:false, reason:'CUSTOMER_NOT_FOUND'|'BRANCH_NOT_FOUND'
--                              |'BRANCH_INACTIVE'|'INTERNAL_ERROR',
--       detail? }
--
-- Contract:
--   - ALWAYS inserts a visits row when success=true, even on lockout. This
--     preserves analytics and bill_amount tracking per Business Rule 7.1.
--   - SELECT ... FOR UPDATE on the customer row prevents races if the same
--     customer scans twice simultaneously.
--   - Chain-wide lockout: last_scan_at within 24h + stamps >= 1 → lockout.
--   - Card cap at 10 stamps (hard CHECK constraint on customers.current_stamps).
--     If card is already full, scan still records + tracks spend but does not
--     increment; ready_for_reward stays true until Chunk 4 redemption.

create or replace function public.fn_process_scan(
  p_customer_id uuid,
  p_branch_id uuid,
  p_bill_amount numeric,
  p_device_fingerprint text,
  p_ip_address inet
)
returns json
language plpgsql
security definer
as $$
declare
  v_branch_active boolean;
  v_stamps int;
  v_last timestamptz;
  v_lockout boolean;
  v_stamp_awarded boolean;
  v_visit_id uuid;
  v_stamps_after int;
  v_ready_for_reward boolean;
  v_next_eligible_at timestamptz;
begin
  -- 1. Defensive branch check (controller already validated; this guards races).
  select active into v_branch_active
  from public.branches
  where id = p_branch_id
  for share;

  if not found then
    return json_build_object('success', false, 'reason', 'BRANCH_NOT_FOUND');
  end if;

  if not v_branch_active then
    return json_build_object('success', false, 'reason', 'BRANCH_INACTIVE');
  end if;

  -- 2. Row-lock the customer to serialize concurrent scans.
  select current_stamps, last_scan_at
    into v_stamps, v_last
    from public.customers
    where id = p_customer_id
    for update;

  if not found then
    return json_build_object('success', false, 'reason', 'CUSTOMER_NOT_FOUND');
  end if;

  -- 3. Compute chain-wide lockout. Only customers with at least one prior
  --    stamped visit are subject to the 24h rule; a brand-new customer with
  --    no stamps would never hit this path (they're routed to registration).
  v_lockout := (
    v_last is not null
    and v_last > now() - interval '24 hours'
    and v_stamps >= 1
  );
  v_stamp_awarded := not v_lockout;

  -- 4. Card-full cap: if already at 10, don't attempt to increment. Visit is
  --    still recorded (spend + total_visits update below). Customer stays at
  --    10 until Chunk 4 issues the reward and resets the card.
  if v_stamp_awarded and v_stamps >= 10 then
    v_stamp_awarded := false;
  end if;

  -- 5. Insert the visit row — ALWAYS, even on lockout.
  insert into public.visits (
    customer_id, branch_id, scanned_at, stamp_awarded,
    lockout_applied, bill_amount, bill_amount_source,
    device_fingerprint, ip_address
  ) values (
    p_customer_id, p_branch_id, now(), v_stamp_awarded,
    v_lockout, p_bill_amount, 'self_reported',
    p_device_fingerprint, p_ip_address
  )
  returning id into v_visit_id;

  -- 6. Update customer aggregates. Spend + visit count are always tracked,
  --    even when the stamp is withheld (lockout OR card-full).
  if v_stamp_awarded then
    update public.customers set
      current_stamps = current_stamps + 1,
      total_visits = total_visits + 1,
      last_scan_at = now(),
      total_self_reported_spend_sar = total_self_reported_spend_sar + p_bill_amount
    where id = p_customer_id
    returning current_stamps into v_stamps_after;
  else
    update public.customers set
      total_visits = total_visits + 1,
      total_self_reported_spend_sar = total_self_reported_spend_sar + p_bill_amount
    where id = p_customer_id;
    v_stamps_after := v_stamps;
  end if;

  v_ready_for_reward := (v_stamps_after >= 10);
  v_next_eligible_at := case
    when v_lockout then v_last + interval '24 hours'
    else null
  end;

  return json_build_object(
    'success', true,
    'visit_id', v_visit_id,
    'stamp_awarded', v_stamp_awarded,
    'lockout_applied', v_lockout,
    'current_stamps', v_stamps_after,
    'ready_for_reward', v_ready_for_reward,
    'next_eligible_at', v_next_eligible_at
  );
exception
  when others then
    return json_build_object(
      'success', false,
      'reason', 'INTERNAL_ERROR',
      'detail', sqlerrm
    );
end;
$$;
