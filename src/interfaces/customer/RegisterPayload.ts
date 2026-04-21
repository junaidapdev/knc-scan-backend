export interface RegisterPayload {
  phone: string;
  name: string;
  birthday_month: number;
  birthday_day: number;
  preferred_branch_id: string;
  language: 'ar' | 'en';
  consent_marketing: boolean;
  branch_scan_id: string;
}
