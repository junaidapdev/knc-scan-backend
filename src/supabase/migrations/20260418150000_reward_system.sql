-- Chunk 4 Migration: reward system
--
-- Adds:
--  1) rewards_issued.reward_name_snapshot_ar + reward_description_snapshot_ar —
--     bilingual snapshot (the existing *_snapshot columns hold English).
--  2) reward_assignment_cursor — singleton round-robin pointer.
--  3) rewards_catalog partial index on status='active' for fast picks.
--  4) fn_issue_reward_if_ready(customer_id) — atomic reward issuance.
--  5) fn_process_scan — UPDATED to call fn_issue_reward_if_ready on the 10th
--     stamp. Returns issued_reward + catalog_empty in the response JSON.
--  6) fn_redeem_reward(unique_code, customer_id, branch_id, ip, device) —
--     atomic two-step-safe redemption transition.
--  7) fn_expire_stale_rewards() — nightly cron target.

-- ---------------------------------------------------------------------------
-- 1) Bilingual snapshot columns on rewards_issued
-- ---------------------------------------------------------------------------
alter table public.rewards_issued
  add column if not exists reward_name_snapshot_ar text,
  add column if not exists reward_description_snapshot_ar text;

comment on column public.rewards_issued.reward_name_snapshot_ar is
  'Arabic name captured at issuance time. Never updated by catalog edits.';

-- ---------------------------------------------------------------------------
-- 2) reward_assignment_cursor — singleton
-- ---------------------------------------------------------------------------
create table if not exists public.reward_assignment_cursor (
  id smallint primary key default 1 check (id = 1),
  last_catalog_id uuid references public.rewards_catalog(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.reward_assignment_cursor (id)
  values (1)
  on conflict (id) do nothing;

alter table public.reward_assignment_cursor enable row level security;
-- No policies: service-role only.

comment on table public.reward_assignment_cursor is
  'Singleton row holding the round-robin pointer for reward issuance.';

-- ---------------------------------------------------------------------------
-- 3) Fast active-catalog index
-- ---------------------------------------------------------------------------
create index if not exists rewards_catalog_active_id_idx
  on public.rewards_catalog (id)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- 4) fn_issue_reward_if_ready
-- ---------------------------------------------------------------------------
-- Returns JSON:
--   nothing to do (card not full):
--     null
--   catalog empty (card full but no active rewards):
--     { "empty": true }
--   success:
--     { "reward_id", "unique_code", "name_en", "name_ar",
--       "description_en", "description_ar", "expires_at",
--       "estimated_value_sar", "catalog_id" }
--
-- Must be called from inside a transaction holding a row lock on the
-- customer (fn_process_scan does this). Locks reward_assignment_cursor
-- row with FOR UPDATE to serialize issuance across concurrent scans.

create or replace function public.fn_issue_reward_if_ready(
  p_customer_id uuid
)
returns json
language plpgsql
security definer
as $$
declare
  v_current_stamps int;
  v_last_cursor uuid;
  v_picked public.rewards_catalog%rowtype;
  v_suffix text;
  v_candidate_code text;
  v_attempt int := 0;
  v_max_attempts constant int := 5;
  v_reward_id uuid;
  v_expires_at timestamptz;
  v_inserted boolean;
begin
  -- 1. Read current stamps (customer row is already locked by caller).
  select current_stamps into v_current_stamps
    from public.customers
    where id = p_customer_id;

  if v_current_stamps < 10 then
    return null;  -- no-op
  end if;

  -- 2. Lock the singleton cursor row. Serializes issuance globally.
  select last_catalog_id into v_last_cursor
    from public.reward_assignment_cursor
    where id = 1
    for update;

  -- 3. Pick next active catalog item after the cursor.
  select * into v_picked
    from public.rewards_catalog
    where status = 'active'
      and (v_last_cursor is null or id > v_last_cursor)
    order by id asc
    limit 1;

  if not found then
    -- Wrap: pick the first active item regardless of id.
    select * into v_picked
      from public.rewards_catalog
      where status = 'active'
      order by id asc
      limit 1;
  end if;

  if not found then
    raise notice 'REWARD_CATALOG_EMPTY: customer % reached 10 stamps but no active rewards exist', p_customer_id;
    return json_build_object('empty', true);
  end if;

  v_expires_at := now() + (v_picked.default_expiry_days * interval '1 day');

  -- 4. Generate unique_code with collision retry.
  v_inserted := false;
  while v_attempt < v_max_attempts and not v_inserted loop
    v_attempt := v_attempt + 1;
    -- 4-char alphanumeric uppercase suffix derived from random + clock
    v_suffix := upper(
      substr(
        translate(
          encode(gen_random_bytes(8), 'base64'),
          '+/=',
          ''
        ),
        1, 4
      )
    );
    v_candidate_code := v_picked.code_prefix || '-' || v_suffix;

    begin
      insert into public.rewards_issued (
        customer_id,
        catalog_id,
        unique_code,
        reward_name_snapshot,
        reward_name_snapshot_ar,
        reward_description_snapshot,
        reward_description_snapshot_ar,
        expires_at,
        status
      ) values (
        p_customer_id,
        v_picked.id,
        v_candidate_code,
        v_picked.name_en,
        v_picked.name_ar,
        v_picked.description_en,
        v_picked.description_ar,
        v_expires_at,
        'pending'
      )
      returning id into v_reward_id;
      v_inserted := true;
    exception when unique_violation then
      -- try again
      null;
    end;
  end loop;

  if not v_inserted then
    raise exception 'Failed to generate unique reward code after % attempts', v_max_attempts;
  end if;

  -- 5. Reset stamps, bump cards_completed.
  update public.customers set
    current_stamps = 0,
    cards_completed = cards_completed + 1
    where id = p_customer_id;

  -- 6. Advance the cursor.
  update public.reward_assignment_cursor set
    last_catalog_id = v_picked.id,
    updated_at = now()
    where id = 1;

  return json_build_object(
    'reward_id', v_reward_id,
    'unique_code', v_candidate_code,
    'catalog_id', v_picked.id,
    'name_en', v_picked.name_en,
    'name_ar', v_picked.name_ar,
    'description_en', v_picked.description_en,
    'description_ar', v_picked.description_ar,
    'estimated_value_sar', v_picked.estimated_value_sar,
    'expires_at', v_expires_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Replace fn_process_scan to invoke fn_issue_reward_if_ready
-- ---------------------------------------------------------------------------
-- Returns JSON (success branch now includes):
--   { ..., issued_reward: <obj|null>, catalog_empty: <bool> }
-- On reward issuance, current_stamps in response is the post-reset value (0),
-- ready_for_reward is false (already given), and issued_reward is populated.

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

  v_lockout := (
    v_last is not null
    and v_last > now() - interval '24 hours'
    and v_stamps >= 1
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

  -- Reward issuance step. Runs only when the card just filled to 10.
  v_issued := null;
  if v_stamps_after >= 10 then
    v_issued := public.fn_issue_reward_if_ready(p_customer_id);
    if v_issued is not null and (v_issued->>'empty')::boolean is true then
      v_catalog_empty := true;
      v_issued := null;
    elsif v_issued is not null then
      -- Reward was issued; fn_issue_reward_if_ready reset stamps to 0.
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

-- ---------------------------------------------------------------------------
-- 6) fn_redeem_reward — atomic step-2 state transition
-- ---------------------------------------------------------------------------
-- Returns JSON:
--   success: { success:true, reward:{ id, unique_code, redeemed_at, branch_id, ... } }
--   failure: { success:false, reason:'REWARD_NOT_FOUND'|'REWARD_NOT_OWNED'
--                                       |'REWARD_ALREADY_REDEEMED'|'REWARD_EXPIRED' }
--
-- The controller maps ALREADY_REDEEMED + EXPIRED to REWARD_NOT_PENDING (409)
-- per the task spec.

create or replace function public.fn_redeem_reward(
  p_unique_code text,
  p_customer_id uuid,
  p_branch_id uuid,
  p_ip inet,
  p_device_fingerprint text
)
returns json
language plpgsql
security definer
as $$
declare
  v_reward public.rewards_issued%rowtype;
begin
  select * into v_reward
    from public.rewards_issued
    where unique_code = p_unique_code
    for update;

  if not found then
    return json_build_object('success', false, 'reason', 'REWARD_NOT_FOUND');
  end if;

  if v_reward.customer_id <> p_customer_id then
    return json_build_object('success', false, 'reason', 'REWARD_NOT_OWNED');
  end if;

  if v_reward.status = 'redeemed' then
    return json_build_object('success', false, 'reason', 'REWARD_ALREADY_REDEEMED');
  end if;

  -- Treat passed-expiry rows as expired even if cron hasn't flipped them yet.
  if v_reward.status = 'expired' or v_reward.expires_at < now() then
    if v_reward.status = 'pending' then
      update public.rewards_issued set status = 'expired'
        where id = v_reward.id;
    end if;
    return json_build_object('success', false, 'reason', 'REWARD_EXPIRED');
  end if;

  update public.rewards_issued set
    status = 'redeemed',
    redeemed_at = now(),
    redeemed_at_branch_id = p_branch_id,
    redemption_ip = p_ip,
    redemption_device_fingerprint = p_device_fingerprint
    where id = v_reward.id;

  return json_build_object(
    'success', true,
    'reward', json_build_object(
      'id', v_reward.id,
      'unique_code', v_reward.unique_code,
      'customer_id', v_reward.customer_id,
      'catalog_id', v_reward.catalog_id,
      'reward_name_snapshot', v_reward.reward_name_snapshot,
      'reward_name_snapshot_ar', v_reward.reward_name_snapshot_ar,
      'redeemed_at', now(),
      'redeemed_at_branch_id', p_branch_id,
      'status', 'redeemed'
    )
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

-- ---------------------------------------------------------------------------
-- 7) fn_expire_stale_rewards — cron target
-- ---------------------------------------------------------------------------
create or replace function public.fn_expire_stale_rewards()
returns int
language plpgsql
security definer
as $$
declare
  v_count int;
begin
  update public.rewards_issued
    set status = 'expired'
    where status = 'pending'
      and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.fn_expire_stale_rewards() is
  'Nightly cron target. Marks pending rewards past expires_at as expired.';
