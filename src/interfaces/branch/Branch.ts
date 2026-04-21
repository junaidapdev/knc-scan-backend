export interface Branch {
  id: string; // UUID
  name: string;
  city: string;
  qr_identifier: string;
  google_review_url: string | null;
  carries_boxed_chocolates: boolean;
  address: string | null;
  active: boolean;
  created_at: string;
}
