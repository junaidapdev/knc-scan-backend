import type { CatalogStatus } from './CatalogItem';

/**
 * Partial update for an existing catalog item. code_prefix is intentionally
 * immutable — it's embedded in already-issued reward unique_codes.
 */
export interface CatalogUpdatePayload {
  name_en?: string;
  name_ar?: string;
  description_en?: string | null;
  description_ar?: string | null;
  image_url?: string | null;
  estimated_value_sar?: number;
  default_expiry_days?: number;
  status?: CatalogStatus;
}
