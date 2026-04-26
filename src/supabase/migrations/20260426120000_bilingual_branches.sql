-- Bilingual branch metadata.
--
-- Adds Arabic translations for the customer-visible branch fields. The
-- columns are nullable so this is a safe drop-in: existing rows continue
-- to render their English values, and the frontend falls back to the
-- English column whenever the Arabic one is null or empty.
--
-- Backfill is intentionally NOT in this migration — admins fill the
-- Arabic translations in via the admin portal (or a separate seed step)
-- once the schema is live. That way we can iterate on the wording per
-- branch without rewriting migration history.

alter table public.branches
  add column if not exists name_ar    text,
  add column if not exists city_ar    text,
  add column if not exists address_ar text;

comment on column public.branches.name_ar    is
  'Arabic display name for this branch. Frontend falls back to name when null.';
comment on column public.branches.city_ar    is
  'Arabic display city for this branch. Frontend falls back to city when null.';
comment on column public.branches.address_ar is
  'Arabic address for this branch. Frontend falls back to address when null.';
