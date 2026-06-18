// src/lib/tokens.test.ts
// Tests for the share-token mint + expiry helpers in ./tokens.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expiryFromNow, isExpired, mintToken } from './tokens';

const ALPHABET_REGEX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

describe('mintToken', () => {
  it('returns an 8-character string', () => {
    const token = mintToken();
    expect(typeof token).toBe('string');
    expect(token).toHaveLength(8);
  });

  it('uses only the unambiguous alphabet (no 0, O, 1, l, I)', () => {
    // Sample many tokens to make the alphabet check meaningful.
    for (let i = 0; i < 200; i++) {
      const token = mintToken();
      expect(token).toMatch(ALPHABET_REGEX);
      // Belt-and-suspenders: explicitly assert the forbidden chars never appear.
      expect(token).not.toMatch(/[0O1lI]/);
    }
  });

  it('produces distinct values across 100 calls (collision-resistant)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(mintToken());
    }
    // 32^8 ≈ 1.1 trillion combos — collisions in 100 picks should be vanishingly rare.
    expect(seen.size).toBe(100);
  });
});

describe('expiryFromNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin to a stable, non-DST midnight UTC so ISO output is deterministic.
    vi.setSystemTime(new Date('2026-06-17T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an ISO string ~5 days in the future for expiryFromNow(5)', () => {
    const iso = expiryFromNow(5);
    expect(iso).toBe('2026-06-22T12:00:00.000Z');
    // And matches the exact ms math.
    expect(Date.parse(iso)).toBe(Date.now() + 5 * DAY_MS);
  });

  it('defaults to 5 days when no argument is supplied', () => {
    expect(expiryFromNow()).toBe(expiryFromNow(5));
  });
});

describe('isExpired', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false for a future ISO timestamp', () => {
    const future = new Date(Date.now() + DAY_MS).toISOString();
    expect(isExpired(future)).toBe(false);
  });

  it('returns true for a past ISO timestamp', () => {
    const past = new Date(Date.now() - DAY_MS).toISOString();
    expect(isExpired(past)).toBe(true);
  });

  it('returns true at the exact "now" boundary (uses <=)', () => {
    // Source uses `t <= Date.now()`, so an ISO equal to now is treated as expired.
    const now = new Date(Date.now()).toISOString();
    expect(isExpired(now)).toBe(true);
  });
});
