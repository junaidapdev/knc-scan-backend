export interface KpiTimeseriesPoint {
  date: string; // ISO date, Asia/Riyadh day bucket
  scans: number;
  stamps_awarded: number;
  lockouts: number;
  total_bill_amount: number;
  unique_customers: number;
}
