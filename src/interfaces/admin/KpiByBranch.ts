export interface KpiByBranch {
  branch_id: string;
  branch_name: string;
  city: string;
  active: boolean;
  scans_30d: number;
  stamps_30d: number;
  spend_30d: number;
  unique_customers_30d: number;
}
