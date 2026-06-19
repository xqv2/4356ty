// src/lib/format.ts
// Pure formatting + parsing helpers. Money lives in CENTS everywhere; only
// the render layer should call formatMoney().

const MONTH_NAMES_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Format integer cents as `$X.XX`. Negative amounts get a leading minus. */
export function formatMoney(cents: number): string {
  if (!Number.isFinite(cents)) return '$0.00';
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const dollarsStr = dollars.toLocaleString('en-US');
  const centsStr = remainder.toString().padStart(2, '0');
  return `${sign}$${dollarsStr}.${centsStr}`;
}

/** "April 2026" — long month + 4-digit year. */
export function formatCycleLabel(year: number, month: number): string {
  const idx = clampMonth(month) - 1;
  return `${MONTH_NAMES_LONG[idx]} ${year}`;
}

/** Long month only — "April". */
export function formatMonthName(month: number): string {
  const idx = clampMonth(month) - 1;
  return MONTH_NAMES_LONG[idx]!;
}

/** Current `{ year, month }` in the runtime's local timezone. */
export function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Parse a user-typed money string like `"$1,234.56"`, `"1234"`, `"  12.5 "`,
 *  or `""` into integer cents. Returns 0 for blank / unparseable input. */
export function parseAmountToCents(input: string | number | null | undefined): number {
  if (input == null) return 0;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return 0;
    return Math.round(input * 100);
  }

  const trimmed = input.trim();
  if (!trimmed) return 0;

  // Strip everything except digits, decimal point, and leading minus.
  const cleaned = trimmed.replace(/[^\d.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return 0;

  const negative = cleaned.startsWith('-');
  const unsigned = negative ? cleaned.slice(1) : cleaned;

  // Only allow one decimal point — collapse extras.
  const firstDot = unsigned.indexOf('.');
  let normalized = unsigned;
  if (firstDot !== -1) {
    normalized =
      unsigned.slice(0, firstDot + 1) +
      unsigned.slice(firstDot + 1).replace(/\./g, '');
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return 0;

  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

function clampMonth(month: number): number {
  if (!Number.isFinite(month)) return 1;
  const m = Math.trunc(month);
  if (m < 1) return 1;
  if (m > 12) return 12;
  return m;
}
