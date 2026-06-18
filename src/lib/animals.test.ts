import { describe, expect, it } from 'vitest';

import { DISPLAY_NAMES, EMOJI, POOL, pickAnimals } from './animals';

describe('POOL', () => {
  it('has exactly 12 entries', () => {
    expect(POOL).toHaveLength(12);
  });

  it('contains the expected animal keys in order', () => {
    expect(POOL).toEqual([
      'bichon',
      'doodle',
      'duck',
      'lamb',
      'otter',
      'panda',
      'pomeranian',
      'samoyed',
      'sea-bunny',
      'seahorse',
      'seal',
      'wheaten',
    ]);
  });

  it.each([
    'bichon',
    'doodle',
    'duck',
    'lamb',
    'otter',
    'panda',
    'pomeranian',
    'samoyed',
    'sea-bunny',
    'seahorse',
    'seal',
    'wheaten',
  ] as const)('includes %s', (key) => {
    expect(POOL).toContain(key);
  });

  it('has no duplicate entries', () => {
    expect(new Set(POOL).size).toBe(POOL.length);
  });
});

describe('DISPLAY_NAMES', () => {
  it('has a label for every POOL entry', () => {
    for (const key of POOL) {
      expect(DISPLAY_NAMES[key]).toBeTypeOf('string');
      expect(DISPLAY_NAMES[key].length).toBeGreaterThan(0);
    }
  });

  it('has the same number of keys as POOL', () => {
    expect(Object.keys(DISPLAY_NAMES)).toHaveLength(POOL.length);
  });
});

describe('EMOJI', () => {
  it('has an emoji for every POOL entry', () => {
    for (const key of POOL) {
      expect(EMOJI[key]).toBeTypeOf('string');
      expect(EMOJI[key].length).toBeGreaterThan(0);
    }
  });

  it('has the same number of keys as POOL', () => {
    expect(Object.keys(EMOJI)).toHaveLength(POOL.length);
  });
});

describe('pickAnimals', () => {
  it('returns an empty array for n=0', () => {
    expect(pickAnimals(0)).toEqual([]);
  });

  it.each([1, 2, 3, 5, 8, 11])(
    'returns exactly %i unique items when n <= POOL.length',
    (n) => {
      const picked = pickAnimals(n);
      expect(picked).toHaveLength(n);
      expect(new Set(picked).size).toBe(n);
      for (const key of picked) {
        expect(POOL).toContain(key);
      }
    },
  );

  it('returns all 12 unique items when n equals POOL.length', () => {
    const picked = pickAnimals(POOL.length);
    expect(picked).toHaveLength(POOL.length);
    expect(new Set(picked)).toEqual(new Set(POOL));
  });

  it('clamps n to POOL.length when n exceeds it (no duplicates)', () => {
    const picked = pickAnimals(20);
    expect(picked).toHaveLength(POOL.length);
    expect(new Set(picked).size).toBe(POOL.length);
    expect(new Set(picked)).toEqual(new Set(POOL));
  });

  it.each([-1, -100, Number.NEGATIVE_INFINITY])(
    'clamps negative n (%s) to 0',
    (n) => {
      expect(pickAnimals(n)).toEqual([]);
    },
  );

  it('clamps NaN to 0', () => {
    expect(pickAnimals(Number.NaN)).toEqual([]);
  });

  it('truncates non-integer n', () => {
    expect(pickAnimals(3.9)).toHaveLength(3);
    expect(pickAnimals(0.5)).toHaveLength(0);
  });

  it('returns only valid AnimalKey values from POOL', () => {
    const picked = pickAnimals(POOL.length);
    for (const key of picked) {
      expect(POOL).toContain(key);
    }
  });

  it('produces varied first elements across many calls (probabilistic)', () => {
    const firsts = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const picked = pickAnimals(POOL.length);
      if (picked[0]) firsts.add(picked[0]);
    }
    // With a uniform shuffle over 12 entries across 50 trials, seeing
    // fewer than 2 distinct first-elements is astronomically unlikely.
    expect(firsts.size).toBeGreaterThanOrEqual(2);
  });
});
