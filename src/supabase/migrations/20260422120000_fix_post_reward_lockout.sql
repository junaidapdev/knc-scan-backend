-- Fix: post-reward same-day re-stamp bug
--
-- Root cause:
--   fn_process_scan's lockout predicate required `current_stamps >= 1`:
--     v_lockout := (v_last is not null
--                   and v_last > now() - interval '24 hours'
--                   and v_stamps >= 1);
--
--   When a reward is issued mid-transaction, fn_issue_reward_if_ready resets
--   current_stamps to 0 but does NOT touch last_scan_at. So on the very next
--   scan (same day), v_stamps=0 bypasses the 24h lockout and the customer
--   earns another stamp they shouldn't have.
--
-- The `v_stamps >= 1` guard was originally intended to exempt brand-new
-- customers with no stamps, but brand-new customers never reach this RPC —
-- they go through register_customer_and_visit. So the guard is unused and
-- collides with the post-reward reset state.
--
-- Fix: drop `v_stamps >= 1`. The 24h window on last_scan_at is sufficient.

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
  v_issued json;
  v_catalog_empty boolean := false;
begin
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

  select current_stamps, last_scan_at
    into v_stamps, v_last
    from public.customers
    where id = p_customer_id
    for update;

  if not found then
    return json_build_object('success', false, 'reason', 'CUSTOMER_NOT_FOUND');
  end if;

  -- 24h chain-wide lockout. Any prior scan within the last 24 hours triggers
  -- it — regardless of current_stamps, which may be 0 after a just-issued
  -- reward reset the card.
  v_lockout := (
    v_last is not null
    and v_last > now() - interval '24 hours'
  );
  v_stamp_awarded := not v_lockout;

  if v_stamp_awarded and v_stamps >= 10 then
    v_stamp_awarded := false;
  end if;

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

  v_issued := null;
  if v_stamps_after >= 10 then
    v_issued := public.fn_issue_reward_if_ready(p_customer_id);
    if v_issued is not null and (v_issued->>'empty')::boolean is true then
      v_catalog_empty := true;
      v_issued := null;
    elsif v_issued is not null then
      v_stamps_after := 0;
    end if;
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
    'next_eligible_at', v_next_eligible_at,
    'issued_reward', v_issued,
    'catalog_empty', v_catalog_empty
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
