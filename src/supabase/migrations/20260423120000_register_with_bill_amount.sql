-- Capture bill_amount on a customer's first visit (registration flow).
--
-- Before this change, register_customer_and_visit inserted the first visit
-- row with bill_amount = NULL and initialized total_self_reported_spend_sar
-- to 0 — the registration controller had no parameter to pass an amount and
-- the frontend was skipping the /scan/amount step entirely. The fix has two
-- halves: the frontend now collects bill_amount before the registration form
-- (see commit on knc-scan-frontend), and this migration extends the RPC to
-- accept and persist it.
--
-- Schema is otherwise unchanged. The new parameter is required (no default)
-- so callers cannot accidentally lose the amount again.

create or replace function public.register_customer_and_visit(
  p_phone text,
  p_name text,
  p_birthday_month int,
  p_birthday_day int,
  p_preferred_branch_id uuid,
  p_language text,
  p_consent_marketing boolean,
  p_branch_scan_id uuid,
  p_bill_amount numeric
)
returns json as $$
declare
  v_customer_id uuid;
  v_visit_id uuid;
begin
  -- Insert into customers (phone uniqueness constraint handles duplicates).
  insert into public.customers (
    phone, name, birthday_month, birthday_day, preferred_branch_id, language, consent_marketing,
    current_stamps, last_scan_at, total_visits, cards_completed, total_self_reported_spend_sar, tier, lifetime_points
  ) values (
    p_phone, p_name, p_birthday_month, p_birthday_day, p_preferred_branch_id, p_language, p_consent_marketing,
    1, now(), 1, 0, p_bill_amount, 'standard', 0
  ) returning id into v_customer_id;

  -- Insert the first visit, including the bill amount and source.
  insert into public.visits (
    customer_id, branch_id, scanned_at, stamp_awarded, lockout_applied,
    bill_amount, bill_amount_source
  ) values (
    v_customer_id, p_branch_scan_id, now(), true, false,
    p_bill_amount, 'self_reported'
  ) returning id into v_visit_id;

  return json_build_object(
    'success', true,
    'customer_id', v_customer_id,
    'visit_id', v_visit_id,
    'current_stamps', 1
  );
exception
  when unique_violation then
    return json_build_object('success', false, 'reason', 'CUSTOMER_ALREADY_EXISTS');
  when others then
    return json_build_object('success', false, 'reason', sqlerrm);
end;
$$ language plpgsql security definer;

-- Drop the old 8-arg signature so callers pinning to the old shape fail
-- loudly rather than silently calling a stale definition.
drop function if exists public.register_customer_and_visit(
  text, text, int, int, uuid, text, boolean, uuid
);
