export type CatalogStatus = 'active' | 'paused' | 'archived';

export interface CatalogItem {
  id: string;
  code_prefix: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  image_url: string | null;
  estimated_value_sar: number;
  default_expiry_days: number;
  status: CatalogStatus;
  created_at: string;
  updated_at: string;
}
