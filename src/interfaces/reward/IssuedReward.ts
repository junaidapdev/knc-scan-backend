export type IssuedRewardStatus = 'pending' | 'redeemed' | 'expired';

export interface IssuedReward {
  id: string;
  unique_code: string;
  catalog_id: string;
  reward_name_snapshot: string;
  reward_name_snapshot_ar: string | null;
  reward_description_snapshot: string | null;
  reward_description_snapshot_ar: string | null;
  issued_at: string;
  expires_at: string;
  status: IssuedRewardStatus;
  redeemed_at: string | null;
  redeemed_at_branch_id: string | null;
  redemption_instructions?: { en: string; ar: string };
}
