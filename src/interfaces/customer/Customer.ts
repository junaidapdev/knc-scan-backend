export interface Customer {
  id: string;
  phone: string;
  name: string | null;
  birthday_month: number | null;
  birthday_day: number | null;
  preferred_branch_id: string | null;
  language: 'ar' | 'en';
  consent_marketing: boolean;
  created_at: string;
  last_scan_at: string | null;
  total_visits: number;
  current_stamps: number;
  cards_completed: number;
  total_self_reported_spend_sar: number;
  tier: string;
  lifetime_points: number;
}
