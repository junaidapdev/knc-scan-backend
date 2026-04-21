/**
 * Summary of a reward issued inline with a scan (10th stamp).
 */
export interface ScanIssuedReward {
  reward_id: string;
  unique_code: string;
  catalog_id: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  estimated_value_sar: number;
  expires_at: string;
}

/**
 * Success response for POST /visits/scan when a stamp was awarded
 * (stamp_awarded=true) OR the card was already full (stamp_awarded=false,
 * ready_for_reward=true). Lockout cases are returned as apiError and
 * described by LockoutResult.
 *
 * When the scan triggers reward issuance (the stamp that fills the card),
 * issued_reward is populated and current_stamps reflects the post-reset
 * value (0). When no active catalog items exist at the moment of issuance,
 * catalog_empty=true and the customer stays at 10 stamps.
 */
export interface ScanResult {
  stamp_awarded: boolean;
  current_stamps: number;
  ready_for_reward: boolean;
  visit_id: string;
  issued_reward: ScanIssuedReward | null;
  catalog_empty: boolean;
}
