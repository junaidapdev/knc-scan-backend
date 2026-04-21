/**
 * Response body for POST /rewards/:unique_code/confirm-redeem-step-1. The UI
 * displays this summary to the cashier; they tap "Yes, Redeemed" to trigger
 * step 2 using the redemption_token.
 */
export interface RedemptionConfirmation {
  redemption_token: string;
  summary: {
    customer_name: string | null;
    reward_name: { en: string; ar: string | null };
    unique_code: string;
    expires_at: string;
  };
}
