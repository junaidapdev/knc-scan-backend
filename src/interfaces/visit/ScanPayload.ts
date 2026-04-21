/**
 * Request body for POST /visits/scan.
 * - branch_qr_identifier: printed code at branch counter; resolved to branch_id server-side.
 * - bill_amount: SAR, integer or decimal, validated 1..9999 by zod schema.
 */
export interface ScanPayload {
  branch_qr_identifier: string;
  bill_amount: number;
  device_fingerprint?: string;
}
