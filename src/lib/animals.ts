// src/lib/animals.ts
// The animal pool used on the per-roommate share page.

import type { AnimalKey } from './types';

export const POOL: AnimalKey[] = [
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
];

export const DISPLAY_NAMES: Record<AnimalKey, string> = {
  bichon: 'Bichon',
  doodle: 'Doodle (Golden)',
  duck: 'Duck',
  lamb: 'Lamb',
  otter: 'Otter',
  panda: 'Panda',
  pomeranian: 'Pomeranian',
  samoyed: 'Samoyed',
  'sea-bunny': 'Sea Bunny',
  seahorse: 'Seahorse',
  seal: 'Seal',
  wheaten: 'Wheaten Terrier',
};

export const EMOJI: Record<AnimalKey, string> = {
  bichon: '🐩',
  doodle: '🐶',
  duck: '🦆',
  lamb: '🐑',
  otter: '🦦',
  panda: '🐼',
  pomeranian: '🐕',
  samoyed: '🐕‍🦺',
  'sea-bunny': '🐰',
  seahorse: '🐠',
  seal: '🦭',
  wheaten: '🐕',
};

/**
 * Pick `n` unique random animals from the pool. If `n` exceeds the pool
 * size, the entire pool is returned in a randomized order.
 *
 * Uses Web Crypto for randomness when available (works in Edge + Node 20+);
 * falls back to Math.random in environments where it's missing.
 */
export function pickAnimals(n: number): AnimalKey[] {
  const count = Math.max(0, Math.min(Math.trunc(n), POOL.length));
  const arr = POOL.slice();

  // Fisher-Yates with cryptographic randomness when possible.
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }

  return arr.slice(0, count);
}

function randomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;

  const cryptoObj: Crypto | undefined =
    typeof globalThis !== 'undefined'
      ? (globalThis as unknown as { crypto?: Crypto }).crypto
      : undefined;

  if (cryptoObj?.getRandomValues) {
    // Reject biased samples to keep the distribution uniform.
    const range = maxExclusive;
    const max = Math.floor(0xffffffff / range) * range;
    const buf = new Uint32Array(1);
    let v: number;
    do {
      cryptoObj.getRandomValues(buf);
      v = buf[0]!;
    } while (v >= max);
    return v % range;
  }

  return Math.floor(Math.random() * maxExclusive);
}
