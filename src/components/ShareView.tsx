// src/components/ShareView.tsx
// Server component. Renders the per-roommate proof page (share-shell) shown
// at /share/[token]. Visual contract: mockups/screens/6-share-preview.html
// (Lokesh, with -20% discount + equal-share-note) and 7-share-standard.html
// (Astitva, plain). Note: the only client island is <ShareDetailsToggle/>.

import type { AnimalKey, Bill, Cycle, CycleSplit, Roommate } from '@/lib/types';
import { EMOJI, DISPLAY_NAMES } from '@/lib/animals';
import { formatMoney, formatMonthName } from '@/lib/format';
import ShareDetailsToggle from './ShareDetailsToggle';

export interface ShareViewProps {
  cycle: Cycle;
  bills: Bill[];
  roommate: Roommate;
  split: CycleSplit;
  computedAmountCents: number;
  equalShareCents: number;
  totalCents: number;
  animal: AnimalKey;
  /** Map of bill_id -> signed PDF URL (or null when no attachment). */
  pdfUrls: Record<string, string | null>;
}

/**
 * Split an integer-cent value into the big-dollar string ($123) and the
 * subscript ".45" cents string. We always show two cent digits to match
 * the receipt aesthetic (e.g. $107.00 -> "$107" + ".00").
 */
function splitAmount(cents: number): { dollars: string; cents: string } {
  const safe = Math.max(0, Math.trunc(cents));
  const d = Math.floor(safe / 100);
  const c = safe % 100;
  return {
    dollars: `$${d.toLocaleString('en-US')}`,
    cents: `.${c.toString().padStart(2, '0')}`,
  };
}

/**
 * The barcode line `*BILLS<MM><INITIAL>*` — month padded to two digits and
 * the first letter of the roommate's name (uppercase). Matches mockups 6/7
 * (`*BILLS042L*`, `*BILLS042A*`).
 */
function buildBarcode(month: number, name: string): string {
  const mm = Math.max(1, Math.min(12, Math.trunc(month)))
    .toString()
    .padStart(2, '0');
  const initial = (name.trim().charAt(0) || 'X').toUpperCase();
  return `*BILLS${mm}${initial}*`;
}

export default function ShareView({
  cycle,
  bills,
  roommate,
  split,
  computedAmountCents,
  equalShareCents,
  totalCents,
  animal,
  pdfUrls,
}: ShareViewProps) {
  const monthName = formatMonthName(cycle.month);
  const animalLabel = DISPLAY_NAMES[animal];
  const animalEmoji = EMOJI[animal];
  const { dollars, cents } = splitAmount(computedAmountCents);

  const hasPercentOverride = split.override_percent != null;
  const hasCentsOverride = split.override_cents != null;
  const hasAnyOverride = hasPercentOverride || hasCentsOverride;
  const savedCents = Math.max(0, equalShareCents - computedAmountCents);

  // Roommate count isn't passed in this version of the props, so we infer it
  // from totalCents / equalShareCents (rounded). When equalShare is 0 (empty
  // cycle) we fall back to 0 roommates rather than divide-by-zero.
  const roommateCount =
    equalShareCents > 0
      ? Math.max(1, Math.round(totalCents / equalShareCents))
      : 0;

  return (
    <div className="share-shell">
      <div className="bill-stamp">For {roommate.name}</div>

      <div className="share-summary">
        <div className="animal-avatar">
          <img src={`/animals/${animal}.png`} alt={animalLabel} />
        </div>
        <div className="animal-tag">
          {monthName}&apos;s {animalLabel} {animalEmoji}
        </div>
        <div className="share-meta">
          <b>{formatMoney(totalCents)}</b> total · {roommateCount} roommates
        </div>

        <div className="share-amount">
          {dollars}
          <span className="cents">{cents}</span>
        </div>

        {hasPercentOverride ? (
          <div className="discount-callout">
            −{split.override_percent}% off this month
          </div>
        ) : null}

        {hasAnyOverride ? (
          <div className="equal-share-note">
            <s>{formatMoney(equalShareCents)} equal share</s> · you save{' '}
            <b>{formatMoney(savedCents)}</b>
          </div>
        ) : null}

        <ShareDetailsToggle bills={bills} pdfUrls={pdfUrls} />
      </div>

      <div className="barcode-footer">
        <div className="barcode">{buildBarcode(cycle.month, roommate.name)}</div>
      </div>
    </div>
  );
}
