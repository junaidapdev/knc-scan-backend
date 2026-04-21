/**
 * Mask an E.164 phone number so admin UIs show only the last 3 digits.
 * Example: `+966501234567` → `+9665XXXXX567`.
 *
 * Keeps the leading `+`, the first 4 characters of the national portion, and
 * the trailing 3 digits; replaces the middle with X's. Non-string / too-short
 * values fall through unchanged — the guard is defensive, not load-bearing.
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  // Expect +CCNNNNN... — need at least 8 chars to leave anything visible.
  if (phone.length < 8 || !phone.startsWith('+')) return phone;
  const lead = phone.slice(0, 5); // '+' + 4 digits (e.g. +9665)
  const tail = phone.slice(-3);
  const middleLen = Math.max(1, phone.length - lead.length - tail.length);
  return `${lead}${'X'.repeat(middleLen)}${tail}`;
}
