-- Chunk 1 Migration 09: Row Level Security policies
--
-- Policy model:
--   - Customer JWTs carry a 'phone' custom claim (auth.jwt() ->> 'phone') and an
--     optional 'role' claim. The admin portal sets 'role' = 'admin'.
--   - The service role bypasses RLS entirely — backend Express code and Edge
--     Functions use the service-role key for all writes.
--   - Tables with NO policies here + RLS enabled = no client access at all
--     (admin_users, sms_log).
--
-- Helpers: small SQL functions so policy expressions read cleanly.

create or replace function public.jwt_phone()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'phone', '');
$$;

create or replace function public.jwt_role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.jwt_role() = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------
create policy "branches: public read active"
  on public.branches
  for select
  using (active = true or public.is_admin());

create policy "branches: admin write"
  on public.branches
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
create policy "customers: self read"
  on public.customers
  for select
  using (phone = public.jwt_phone() or public.is_admin());

create policy "customers: self update"
  on public.customers
  for update
  using (phone = public.jwt_phone() or public.is_admin())
  with check (phone = public.jwt_phone() or public.is_admin());

create policy "customers: admin insert"
  on public.customers
  for insert
  with check (public.is_admin());

create policy "customers: admin delete"
  on public.customers
  for delete
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- visits — reads allowed for owner and admin; writes are service-role only.
-- ---------------------------------------------------------------------------
create policy "visits: owner read"
  on public.visits
  for select
  using (
    public.is_admin()
    or customer_id in (
      select id from public.customers where phone = public.jwt_phone()
    )
  );

-- ---------------------------------------------------------------------------
-- rewards_catalog
-- ---------------------------------------------------------------------------
create policy "rewards_catalog: public read active"
  on public.rewards_catalog
  for select
  using (status = 'active' or public.is_admin());

create policy "rewards_catalog: admin write"
  on public.rewards_catalog
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- rewards_issued — owner and admin may read. All state transitions go through
-- service-role Edge Functions / backend code.
-- ---------------------------------------------------------------------------
create policy "rewards_issued: owner read"
  on public.rewards_issued
  for select
  using (
    public.is_admin()
    or customer_id in (
      select id from public.customers where phone = public.jwt_phone()
    )
  );

-- ---------------------------------------------------------------------------
-- feedback — customer inserts & reads own; admin reads all.
-- ---------------------------------------------------------------------------
create policy "feedback: owner read"
  on public.feedback
  for select
  using (
    public.is_admin()
    or customer_id in (
      select id from public.customers where phone = public.jwt_phone()
    )
  );

create policy "feedback: owner insert"
  on public.feedback
  for insert
  with check (
    customer_id in (
      select id from public.customers where phone = public.jwt_phone()
    )
  );

-- ---------------------------------------------------------------------------
-- admin_users, sms_log: RLS is enabled but NO policies are defined. Combined
-- with revoked/absent grants this means client JWTs cannot touch these tables.
-- Only the service role (which bypasses RLS) may read or write.
-- ---------------------------------------------------------------------------
