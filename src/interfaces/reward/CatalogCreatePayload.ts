import type { CatalogStatus } from './CatalogItem';

export interface CatalogCreatePayload {
  code_prefix: string;
  name_en: string;
  name_ar: string;
  description_en?: string;
  description_ar?: string;
  image_url?: string;
  estimated_value_sar: number;
  default_expiry_days: number;
  status?: CatalogStatus;
}
