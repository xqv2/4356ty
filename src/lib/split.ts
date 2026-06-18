// src/lib/split.ts
// Pure split math. Single source of truth — called both server-side (page
// loader) and client-side (during edits) so the first paint matches.
//
// Rules (per CTX):
//   - equalShare = round(total / N) per roommate; the penny remainder is
//     spread across the FIRST N roommates (one extra cent each until the
//     total is exactly hit).
//   - override_cents on a roommate: that roommate pays exactly that amount;
//     others pay the equal share; the bill payer absorbs the difference.
//   - override_percent on a roommate: that roommate pays
//     round(equalShare * (100 - percent) / 100); others pay the equal share;
//     the bill payer absorbs the difference.
//   - A roommate has at most ONE override active (cents OR percent).

import type { ComputedSplit, UUID } from './types';

export interface SplitInputRoommate {
  id: UUID;
  override_cents?: number | null;
  override_percent?: number | null;
}

/**
 * Compute each roommate's owed cents for a given total.
 *
 * - The bill payer is implicit: we don't pull a single payer out of the list
 *   here, but `totalCollectedCents` reflects the absorbed delta. The editor
 *   surfaces the payer separately and shows the delta on their row.
 */
export function computeSplit(
  total_cents: number,
  roommates: SplitInputRoommate[],
): ComputedSplit {
  const n = roommates.length;
  const total = sanitize(total_cents);

  if (n === 0 || total <= 0) {
    return {
      perRoommate: roommates.map((r) => ({ id: r.id, cents: 0 })),
      equalShareCents: 0,
      totalCollectedCents: 0,
    };
  }

  // Baseline equal share: integer cents, with the penny remainder spread
  // across the FIRST N roommates (one extra cent each).
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  const equalShareByIndex: number[] = roommates.map((_, i) =>
    i < remainder ? base + 1 : base,
  );

  // The "headline" equal share number used for the SummaryCard hero — a
  // single value per the mockup. We use the floor base; UI rounds at render.
  const equalShareCents = base;

  const perRoommate = roommates.map((r, i) => {
    const equalForRow = equalShareByIndex[i]!;

    if (isPositive(r.override_cents)) {
      return { id: r.id, cents: clampNonNeg(r.override_cents!) };
    }
    if (isValidPercent(r.override_percent)) {
      const pct = clampPercent(r.override_percent!);
      const owed = Math.round((equalForRow * (100 - pct)) / 100);
      return { id: r.id, cents: clampNonNeg(owed) };
    }
    return { id: r.id, cents: equalForRow };
  });

  const totalCollectedCents = perRoommate.reduce((s, r) => s + r.cents, 0);

  return { perRoommate, equalShareCents, totalCollectedCents };
}

// ---- helpers ----------------------------------------------------------------

function sanitize(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const t = Math.trunc(n);
  return t < 0 ? 0 : t;
}

function isPositive(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function isValidPercent(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 99;
}

function clampNonNeg(n: number): number {
  const t = Math.trunc(n);
  return t < 0 ? 0 : t;
}

function clampPercent(n: number): number {
  const t = Math.trunc(n);
  if (t < 1) return 1;
  if (t > 99) return 99;
  return t;
}
