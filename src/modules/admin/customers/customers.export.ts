import type { Response } from 'express';
import { iterateCustomersForExport } from './customers.service';

const CSV_HEADERS = [
  'id',
  'phone',
  'name',
  'language',
  'tier',
  'current_stamps',
  'cards_completed',
  'total_visits',
  'total_self_reported_spend_sar',
  'last_scan_at',
  'created_at',
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // RFC 4180 quoting: wrap in quotes and double-up any existing quotes when
  // the cell contains comma / quote / newline / CR.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Stream a CSV of all non-deleted customers to `res`. Writes headers +
 * rows as they arrive from Supabase — no full-table buffering. No row cap;
 * admin decided the full dataset is in-scope per export.
 */
export async function streamCustomerCsv(res: Response): Promise<void> {
  const filename = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  res.write(`${CSV_HEADERS.join(',')}\n`);

  for await (const row of iterateCustomersForExport()) {
    const r = row as unknown as Record<string, unknown>;
    const line = CSV_HEADERS.map((h) => csvCell(r[h])).join(',');
    res.write(`${line}\n`);
  }
  res.end();
}
