-- Kayan Sweets V1 — seed data
-- Run AFTER all migrations. Idempotent via ON CONFLICT on qr_identifier.
--
-- TODO: Replace every google_review_url placeholder with the real Google
-- Business review link before launch.

insert into public.branches
  (name, city, qr_identifier, carries_boxed_chocolates, google_review_url, active)
values
  ('Al Rusaifah',   'Makkah', 'KYN-MKK-RSF', true,  'https://example.com/review/TODO-rsf', true),
  ('Al Awali',      'Makkah', 'KYN-MKK-AWL', true,  'https://example.com/review/TODO-awl', true),
  ('Al Shouqiyah',  'Makkah', 'KYN-MKK-SHQ', false, 'https://example.com/review/TODO-shq', true),
  ('Al Marwa',      'Jeddah', 'KYN-JED-MRW', false, 'https://example.com/review/TODO-mrw', true),
  ('Al Salama',     'Jeddah', 'KYN-JED-SLM', true,  'https://example.com/review/TODO-slm', true),
  ('Al Hamdaniyya', 'Jeddah', 'KYN-JED-HMD', false, 'https://example.com/review/TODO-hmd', true),
  ('Al Khumra',     'Jeddah', 'KYN-JED-KHM', false, 'https://example.com/review/TODO-khm', true),
  ('Al Sanabil',    'Jeddah', 'KYN-JED-SNB', true,  'https://example.com/review/TODO-snb', true),
  ('Al Salhiyaa',   'Jeddah', 'KYN-JED-SLH', false, 'https://example.com/review/TODO-slh', true),
  ('Obhur',         'Jeddah', 'KYN-JED-OBR', true,  'https://example.com/review/TODO-obr', true),
  ('Al Shaddha',    'Madina', 'KYN-MAD-SHD', true,  'https://example.com/review/TODO-shd', true),
  ('Al Haramain',   'Other',  'KYN-OTH-HRM', true,  'https://example.com/review/TODO-hrm', true)
on conflict (qr_identifier) do nothing;
