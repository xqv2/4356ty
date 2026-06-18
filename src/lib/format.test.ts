// src/lib/format.test.ts
// Unit tests for the pure formatting + parsing helpers in ./format.ts.
// All money is in CENTS.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentYearMonth,
  formatCycleLabel,
  formatMoney,
  formatMonthName,
  formatTabLabel,
  parseAmountToCents,
} from './format';

describe('formatMoney', () => {
  it.each([
    [0, '$0.00'],
    [1, '$0.01'],
    [99, '$0.99'],
    [100, '$1.00'],
    [13448, '$134.48'],
    [53794, '$537.94'],
    [123456, '$1,234.56'],
    [1000000, '$10,000.00'],
  ])('formats %i cents as %s', (cents, expected) => {
    expect(formatMoney(cents)).toBe(expected);
  });

  it('renders negative amounts with a leading minus before the dollar sign', () => {
    // Impl: `${sign}$${dollarsStr}.${centsStr}` where sign is '-' for cents < 0.
    expect(formatMoney(-13448)).toBe('-$134.48');
    expect(formatMoney(-50)).toBe('-$0.50');
  });

  it('returns "$0.00" for non-finite inputs', () => {
    expect(formatMoney(Number.NaN)).toBe('$0.00');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('$0.00');
    expect(formatMoney(Number.NEGATIVE_INFINITY)).toBe('$0.00');
  });

  it('truncates fractional cents (no rounding up)', () => {
    // Math.trunc(123.7) === 123 → "$1.23"
    expect(formatMoney(123.7)).toBe('$1.23');
    expect(formatMoney(199.99)).toBe('$1.99');
  });
});

describe('formatCycleLabel', () => {
  it.each([
    [2026, 1, 'January 2026'],
    [2026, 4, 'April 2026'],
    [2026, 12, 'December 2026'],
    [1999, 7, 'July 1999'],
  ])('formats %i / %i as %s', (year, month, expected) => {
    expect(formatCycleLabel(year, month)).toBe(expected);
  });

  it('clamps out-of-range months to [1..12]', () => {
    expect(formatCycleLabel(2026, 0)).toBe('January 2026');
    expect(formatCycleLabel(2026, -5)).toBe('January 2026');
    expect(formatCycleLabel(2026, 13)).toBe('December 2026');
    expect(formatCycleLabel(2026, 999)).toBe('December 2026');
  });

  it('clamps non-finite months to January', () => {
    expect(formatCycleLabel(2026, Number.NaN)).toBe('January 2026');
    expect(formatCycleLabel(2026, Number.POSITIVE_INFINITY)).toBe('January 2026');
  });
});

describe('formatTabLabel', () => {
  it.each([
    [1, 'JAN'],
    [2, 'FEB'],
    [3, 'MAR'],
    [4, 'APR'],
    [5, 'MAY'],
    [6, 'JUN'],
    [7, 'JUL'],
    [8, 'AUG'],
    [9, 'SEP'],
    [10, 'OCT'],
    [11, 'NOV'],
    [12, 'DEC'],
  ])('formats month %i as %s', (month, expected) => {
    expect(formatTabLabel(month)).toBe(expected);
  });

  it('clamps out-of-range months', () => {
    expect(formatTabLabel(0)).toBe('JAN');
    expect(formatTabLabel(13)).toBe('DEC');
    expect(formatTabLabel(-1)).toBe('JAN');
  });
});

describe('formatMonthName', () => {
  it('returns the long month name', () => {
    expect(formatMonthName(4)).toBe('April');
    expect(formatMonthName(1)).toBe('January');
    expect(formatMonthName(12)).toBe('December');
  });

  it('clamps out-of-range months', () => {
    expect(formatMonthName(0)).toBe('January');
    expect(formatMonthName(13)).toBe('December');
  });
});

describe('currentYearMonth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 1-indexed month and the full year', () => {
    // April 17, 2026 — Date months are 0-indexed, so month=3 → April → 4.
    vi.setSystemTime(new Date(2026, 3, 17, 12, 0, 0));
    expect(currentYearMonth()).toEqual({ year: 2026, month: 4 });
  });

  it('handles January boundary', () => {
    vi.setSystemTime(new Date(2030, 0, 1, 0, 0, 0));
    expect(currentYearMonth()).toEqual({ year: 2030, month: 1 });
  });

  it('handles December boundary', () => {
    vi.setSystemTime(new Date(2024, 11, 31, 23, 59, 59));
    expect(currentYearMonth()).toEqual({ year: 2024, month: 12 });
  });

  it('always returns sane bounds without fake timers', () => {
    vi.useRealTimers();
    const { year, month } = currentYearMonth();
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
    expect(Number.isInteger(month)).toBe(true);
    expect(year).toBeGreaterThanOrEqual(2024);
    expect(Number.isInteger(year)).toBe(true);
  });
});

describe('parseAmountToCents', () => {
  describe('string input', () => {
    it.each([
      ['$134.48', 13448],
      ['134.48', 13448],
      ['$1,234.56', 123456],
      ['1,234.56', 123456],
      ['123', 12300],
      ['  12.5 ', 1250],
      ['$0.01', 1],
      ['0', 0],
      ['0.00', 0],
    ])('parses %j → %i', (input, expected) => {
      expect(parseAmountToCents(input)).toBe(expected);
    });

    it('returns 0 for blank / whitespace input', () => {
      expect(parseAmountToCents('')).toBe(0);
      expect(parseAmountToCents('   ')).toBe(0);
    });

    it('returns 0 for unparseable / garbage input', () => {
      expect(parseAmountToCents('garbage')).toBe(0);
      expect(parseAmountToCents('abc')).toBe(0);
      expect(parseAmountToCents('-')).toBe(0);
      expect(parseAmountToCents('.')).toBe(0);
      expect(parseAmountToCents('-.')).toBe(0);
    });

    it('handles negative amounts', () => {
      expect(parseAmountToCents('-50')).toBe(-5000);
      expect(parseAmountToCents('-$1.25')).toBe(-125);
    });

    it('collapses multiple decimal points (keeps the first)', () => {
      // "1.2.3" → "1.23" → 123 cents
      expect(parseAmountToCents('1.2.3')).toBe(123);
    });
  });

  describe('number input', () => {
    it('treats a number as a dollar amount and rounds to cents', () => {
      expect(parseAmountToCents(12.34)).toBe(1234);
      expect(parseAmountToCents(0)).toBe(0);
      expect(parseAmountToCents(100)).toBe(10000);
    });

    it('rounds half-up at the cent boundary', () => {
      // 0.105 * 100 = 10.5 → Math.round → 11
      expect(parseAmountToCents(0.105)).toBe(11);
    });

    it('returns 0 for non-finite numbers', () => {
      expect(parseAmountToCents(Number.NaN)).toBe(0);
      expect(parseAmountToCents(Number.POSITIVE_INFINITY)).toBe(0);
      expect(parseAmountToCents(Number.NEGATIVE_INFINITY)).toBe(0);
    });
  });

  describe('null / undefined', () => {
    it('returns 0 for null', () => {
      expect(parseAmountToCents(null)).toBe(0);
    });

    it('returns 0 for undefined', () => {
      expect(parseAmountToCents(undefined)).toBe(0);
    });
  });

  it('round-trips with formatMoney for typical values', () => {
    const cases = [0, 1, 100, 13448, 53794, 123456];
    for (const cents of cases) {
      expect(parseAmountToCents(formatMoney(cents))).toBe(cents);
    }
  });
});
