export interface IssuedRewardAdminRow {
  id: string;
  unique_code: string;
  status: 'pending' | 'redeemed' | 'expired';
  customer_id: string;
  customer_phone_masked: string;
  customer_name: string | null;
  catalog_id: string;
  reward_name_snapshot: string;
  reward_name_snapshot_ar: string | null;
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
  redeemed_at_branch_id: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}

export interface IssuedRewardAdminDetail extends IssuedRewardAdminRow {
  customer_phone_full: string;
  redemption_ip: string | null;
  redemption_device_fingerprint: string | null;
  redeemed_at_branch_name: string | null;
}
