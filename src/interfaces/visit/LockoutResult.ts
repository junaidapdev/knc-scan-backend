/**
 * Payload attached to the apiError(SCAN_LOCKOUT_ACTIVE, 422, ...) response
 * when a scan lands inside the 24h lockout window. The visit is still
 * recorded (visit_id_for_record) so the bill amount and branch are captured
 * for analytics even though no stamp was awarded.
 */
export interface LockoutResult {
  next_eligible_at: string;
  current_stamps: number;
  visit_id_for_record: string;
}
