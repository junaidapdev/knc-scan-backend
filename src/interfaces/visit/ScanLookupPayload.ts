/**
 * Request body for POST /visits/scan/lookup.
 * Phone is E.164-format Saudi mobile (see SAUDI_PHONE_REGEX).
 */
export interface ScanLookupPayload {
  phone: string;
}
