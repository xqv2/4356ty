// src/lib/split.test.ts
// Unit tests for the pure split-math function. All amounts are in cents.

import { describe, it, expect } from 'vitest';

import { computeSplit, type SplitInputRoommate } from './split';

const r = (
  id: string,
  overrides: Partial<Pick<SplitInputRoommate, 'override_cents' | 'override_percent'>> = {},
): SplitInputRoommate => ({
  id,
  override_cents: overrides.override_cents ?? null,
  override_percent: overrides.override_percent ?? null,
});

describe('computeSplit', () => {
  describe('equal split, no overrides', () => {
    it('splits $400 evenly across 4 roommates ($100 each)', () => {
      const roommates = [r('a'), r('b'), r('c'), r('d')];
      const result = computeSplit(40000, roommates);

      expect(result.perRoommate).toEqual([
        { id: 'a', cents: 10000 },
        { id: 'b', cents: 10000 },
        { id: 'c', cents: 10000 },
        { id: 'd', cents: 10000 },
      ]);
      expect(result.equalShareCents).toBe(10000);
      expect(result.totalCollectedCents).toBe(40000);
    });

    it.each([
      // [label, total_cents, n, expectedEach, expectedEqualShare]
      ['$10 / 2', 1000, 2, 500, 500],
      ['$1 / 5', 100, 5, 20, 20],
      ['$0.04 / 4', 4, 4, 1, 1],
    ])('%s splits evenly with no remainder', (_label, total, n, each, share) => {
      const roommates = Array.from({ length: n }, (_, i) => r(String(i)));
      const result = computeSplit(total, roommates);

      expect(result.equalShareCents).toBe(share);
      expect(result.totalCollectedCents).toBe(total);
      expect(result.perRoommate.every((p) => p.cents === each)).toBe(true);
    });
  });

  describe('penny remainder', () => {
    it('spreads a 1-cent remainder across the FIRST roommate ($1.01 / 4)', () => {
      const roommates = [r('a'), r('b'), r('c'), r('d')];
      const result = computeSplit(101, roommates);

      // 101 / 4 = 25 base, remainder 1 → first 1 roommate gets +1 cent.
      expect(result.perRoommate).toEqual([
        { id: 'a', cents: 26 },
        { id: 'b', cents: 25 },
        { id: 'c', cents: 25 },
        { id: 'd', cents: 25 },
      ]);
      // Headline equal share is the FLOOR base, not base+1, even with remainder.
      expect(result.equalShareCents).toBe(25);
      expect(result.totalCollectedCents).toBe(101);
    });

    it.each([
      // [label, total, n, expected per-roommate cents, equalShareCents (floor)]
      ['100 / 3 → first 1 gets +1', 100, 3, [34, 33, 33], 33],
      ['101 / 3 → first 2 get +1', 101, 3, [34, 34, 33], 33],
      ['102 / 3 → exact split', 102, 3, [34, 34, 34], 34],
      ['10001 / 3 → first 2 get +1', 10001, 3, [3334, 3334, 3333], 3333],
    ])('%s', (_label, total, n, expected, share) => {
      const roommates = Array.from({ length: n }, (_, i) => r(String(i)));
      const result = computeSplit(total, roommates);

      expect(result.perRoommate.map((p) => p.cents)).toEqual(expected);
      expect(result.equalShareCents).toBe(share);
      expect(result.totalCollectedCents).toBe(total);
    });
  });

  describe('single override_cents', () => {
    it('honors override_cents on one of four; others pay equal share', () => {
      // Total $400 / 4 → equal share $100. Roommate 'a' overrides to $50.
      const roommates = [
        r('a', { override_cents: 5000 }),
        r('b'),
        r('c'),
        r('d'),
      ];
      const result = computeSplit(40000, roommates);

      expect(result.perRoommate).toEqual([
        { id: 'a', cents: 5000 },
        { id: 'b', cents: 10000 },
        { id: 'c', cents: 10000 },
        { id: 'd', cents: 10000 },
      ]);
      expect(result.equalShareCents).toBe(10000);
      // Bill payer absorbs the $50 delta — totalCollected differs from input.
      expect(result.totalCollectedCents).toBe(35000);
    });

    it('override_cents can exceed the equal share (payer collects more)', () => {
      const roommates = [r('a', { override_cents: 20000 }), r('b'), r('c'), r('d')];
      const result = computeSplit(40000, roommates);

      expect(result.perRoommate.map((p) => p.cents)).toEqual([
        20000, 10000, 10000, 10000,
      ]);
      expect(result.totalCollectedCents).toBe(50000);
    });
  });

  describe('single override_percent', () => {
    it('applies a 20% discount to one of four; others pay equal share', () => {
      // $400 / 4 → equal $100. 20% off → $80 for 'a'.
      const roommates = [
        r('a', { override_percent: 20 }),
        r('b'),
        r('c'),
        r('d'),
      ];
      const result = computeSplit(40000, roommates);

      expect(result.perRoommate).toEqual([
        { id: 'a', cents: 8000 },
        { id: 'b', cents: 10000 },
        { id: 'c', cents: 10000 },
        { id: 'd', cents: 10000 },
      ]);
      expect(result.equalShareCents).toBe(10000);
      expect(result.totalCollectedCents).toBe(38000);
    });

    it.each([
      // [pct, expectedDiscountedCents] for equalShare=10000
      [1, 9900],
      [10, 9000],
      [50, 5000],
      [99, 100],
    ])('honors override_percent=%i (equalShare $100 → $%i¢)', (pct, expected) => {
      const roommates = [
        r('a', { override_percent: pct }),
        r('b'),
        r('c'),
        r('d'),
      ];
      const result = computeSplit(40000, roommates);

      expect(result.perRoommate[0]).toEqual({ id: 'a', cents: expected });
      expect(result.perRoommate.slice(1).every((p) => p.cents === 10000)).toBe(true);
    });
  });

  describe('overrides on every roommate', () => {
    it('every roommate has override_cents → totalCollected sums the overrides', () => {
      const roommates = [
        r('a', { override_cents: 5000 }),
        r('b', { override_cents: 7500 }),
        r('c', { override_cents: 12500 }),
        r('d', { override_cents: 5000 }),
      ];
      const result = computeSplit(40000, roommates);

      expect(result.perRoommate.map((p) => p.cents)).toEqual([
        5000, 7500, 12500, 5000,
      ]);
      // The implicit bill payer absorbs the (40000 - 30000) = 10000 delta.
      expect(result.totalCollectedCents).toBe(30000);
      // equalShareCents is still the floor base from the original total.
      expect(result.equalShareCents).toBe(10000);
    });

    it('every roommate has override_percent → totalCollected reflects all discounts', () => {
      // Equal share = $100 each. All get 25% off → all pay $75. Total = $300.
      const roommates = [
        r('a', { override_percent: 25 }),
        r('b', { override_percent: 25 }),
        r('c', { override_percent: 25 }),
        r('d', { override_percent: 25 }),
      ];
      const result = computeSplit(40000, roommates);

      expect(result.perRoommate.every((p) => p.cents === 7500)).toBe(true);
      expect(result.totalCollectedCents).toBe(30000);
      expect(result.equalShareCents).toBe(10000);
    });
  });

  describe('empty roommates list', () => {
    it('returns empty perRoommate, zeroed totals, no division by zero', () => {
      const result = computeSplit(40000, []);

      expect(result.perRoommate).toEqual([]);
      expect(result.equalShareCents).toBe(0);
      expect(result.totalCollectedCents).toBe(0);
    });
  });

  describe('total = 0, multiple roommates', () => {
    it('every roommate gets 0 cents', () => {
      const roommates = [r('a'), r('b'), r('c'), r('d')];
      const result = computeSplit(0, roommates);

      expect(result.perRoommate).toEqual([
        { id: 'a', cents: 0 },
        { id: 'b', cents: 0 },
        { id: 'c', cents: 0 },
        { id: 'd', cents: 0 },
      ]);
      expect(result.equalShareCents).toBe(0);
      expect(result.totalCollectedCents).toBe(0);
    });

    it('zero total ignores any overrides on the roommates', () => {
      const roommates = [
        r('a', { override_cents: 5000 }),
        r('b', { override_percent: 50 }),
        r('c'),
      ];
      const result = computeSplit(0, roommates);

      expect(result.perRoommate.every((p) => p.cents === 0)).toBe(true);
      expect(result.equalShareCents).toBe(0);
      expect(result.totalCollectedCents).toBe(0);
    });
  });

  describe('mixed: one override_cents + one override_percent', () => {
    it('honors both kinds simultaneously; others unaffected', () => {
      // Total $400 / 4 → equal $100.
      // 'a' fixed to $50; 'c' gets 25% off ($75); 'b' and 'd' pay equal $100.
      const roommates = [
        r('a', { override_cents: 5000 }),
        r('b'),
        r('c', { override_percent: 25 }),
        r('d'),
      ];
      const result = computeSplit(40000, roommates);

      expect(result.perRoommate).toEqual([
        { id: 'a', cents: 5000 },
        { id: 'b', cents: 10000 },
        { id: 'c', cents: 7500 },
        { id: 'd', cents: 10000 },
      ]);
      expect(result.equalShareCents).toBe(10000);
      expect(result.totalCollectedCents).toBe(32500);
    });

    it('when both override_cents and override_percent are set on the SAME roommate, override_cents wins', () => {
      const roommates = [
        r('a', { override_cents: 5000, override_percent: 50 }),
        r('b'),
        r('c'),
        r('d'),
      ];
      const result = computeSplit(40000, roommates);

      // override_cents is checked first, so it wins.
      expect(result.perRoommate[0]).toEqual({ id: 'a', cents: 5000 });
      expect(result.perRoommate.slice(1).every((p) => p.cents === 10000)).toBe(true);
    });
  });
});
