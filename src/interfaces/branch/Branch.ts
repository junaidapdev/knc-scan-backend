export interface Branch {
  id: string; // UUID
  name: string;
  /** Arabic display name. Frontend falls back to `name` when null. */
  name_ar: string | null;
  city: string;
  /** Arabic display city. Frontend falls back to `city` when null. */
  city_ar: string | null;
  qr_identifier: string;
  google_review_url: string | null;
  carries_boxed_chocolates: boolean;
  address: string | null;
  /** Arabic address. Frontend falls back to `address` when null. */
  address_ar: string | null;
  active: boolean;
  created_at: string;
}
