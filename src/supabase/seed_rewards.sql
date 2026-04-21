-- Chunk 4 Seed: rewards_catalog initial 3 rewards.
-- Safe to re-run: ON CONFLICT (code_prefix) DO NOTHING.

insert into public.rewards_catalog (
  code_prefix, name_en, name_ar,
  description_en, description_ar,
  estimated_value_sar, default_expiry_days, status
) values
  (
    'BOX-FAHADAH',
    'Fahadah Boxed Chocolate',
    'علبة شوكولاتة فهادة',
    'A premium boxed selection of Fahadah chocolate.',
    'علبة مختارة فاخرة من شوكولاتة فهادة.',
    35.00, 30, 'active'
  ),
  (
    'BUNDLE-SURPRISE',
    'Kayan Surprise Bundle',
    'حزمة كيان المفاجأة',
    'A surprise bundle of assorted Kayan sweets.',
    'حزمة مفاجأة من تشكيلة حلويات كيان.',
    30.00, 30, 'active'
  ),
  (
    'VOUCHER-30',
    '30 SAR Store Voucher',
    'قسيمة شرائية بقيمة 30 ريال',
    'A 30 SAR voucher redeemable at any Kayan branch.',
    'قسيمة بقيمة 30 ريال قابلة للاستخدام في أي فرع من فروع كيان.',
    30.00, 30, 'active'
  )
on conflict (code_prefix) do nothing;
