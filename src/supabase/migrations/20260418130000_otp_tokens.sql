-- Migration 04: otp_tokens and Auth RPCs

create table public.otp_tokens (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0 check (attempts >= 0),
  consumed boolean not null default false,
  created_at timestamptz not null default now()
);

create index otp_tokens_phone_created_at_idx on public.otp_tokens (phone, created_at desc);

alter table public.otp_tokens enable row level security;
-- Handled entirely by service role. Thus, no client-side RLS policies needed.

-- RPC: Verify OTP
-- Atomically compares hash, checks expiry and attempts, and marks as consumed if valid.
create or replace function public.verify_otp(p_phone text, p_otp text)
returns json as $$
declare
  v_record public.otp_tokens%rowtype;
  v_is_valid boolean;
begin
  -- Find the latest unconsumed token for the phone, locking it against concurrency
  select * into v_record
  from public.otp_tokens
  where phone = p_phone
    and consumed = false
  order by created_at desc
  limit 1
  for update;

  if not found then
    return json_build_object('success', false, 'reason', 'OTP_INVALID');
  end if;

  if v_record.expires_at < now() then
    return json_build_object('success', false, 'reason', 'OTP_EXPIRED');
  end if;

  if v_record.attempts >= 5 then
    return json_build_object('success', false, 'reason', 'OTP_RATE_LIMIT');
  end if;

  -- Verify bcrypt hash
  v_is_valid := (v_record.token_hash = crypt(p_otp, v_record.token_hash));

  if v_is_valid then
    update public.otp_tokens set consumed = true where id = v_record.id;
    return json_build_object('success', true);
  else
    update public.otp_tokens set attempts = attempts + 1 where id = v_record.id;
    return json_build_object('success', false, 'reason', 'OTP_INVALID');
  end if;
end;
$$ language plpgsql security definer;


-- RPC: Register customer and grant their first visit stamp atomically
create or replace function public.register_customer_and_visit(
  p_phone text,
  p_name text,
  p_birthday_month int,
  p_birthday_day int,
  p_preferred_branch_id uuid,
  p_language text,
  p_consent_marketing boolean,
  p_branch_scan_id uuid
)
returns json as $$
declare
  v_customer_id uuid;
  v_visit_id uuid;
begin
  -- Insert into customers (phone uniqueness constraint handles duplicates)
  insert into public.customers (
    phone, name, birthday_month, birthday_day, preferred_branch_id, language, consent_marketing,
    current_stamps, last_scan_at, total_visits, cards_completed, total_self_reported_spend_sar, tier, lifetime_points
  ) values (
    p_phone, p_name, p_birthday_month, p_birthday_day, p_preferred_branch_id, p_language, p_consent_marketing,
    1, now(), 1, 0, 0, 'standard', 0
  ) returning id into v_customer_id;

  -- Insert visit
  insert into public.visits (
    customer_id, branch_id, scanned_at, stamp_awarded, lockout_applied
  ) values (
    v_customer_id, p_branch_scan_id, now(), true, false
  ) returning id into v_visit_id;

  -- Return successfully constructed info
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
