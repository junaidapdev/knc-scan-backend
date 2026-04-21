export interface CustomerProfile {
  id: string;
  name: string | null;
  phone: string;
  current_stamps: number;
  last_scan_at: string | null;
  total_visits: number;
}
