'use client';

import { useEffect, useState } from 'react';
import type { CycleSplit, Roommate } from '@/lib/types';

/** Patch shape emitted by RoommateRow. Any subset of these fields may be
 *  passed to onSave. Use `null` to clear an override field. */
export interface RoommateRowPatch {
  name?: string;
  override_cents?: number | null;
  override_percent?: number | null;
}

export interface RoommateRowProps {
  roommate: Roommate;
  split: CycleSplit;
  /** What this roommate owes for the current cycle, after splits + overrides. */
  computedAmountCents: number;
  onSave: (patch: RoommateRowPatch) => void;
  onDelete: () => void;
  isLandlord?: boolean;
}

// ---- helpers ----------------------------------------------------------------

function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  // Grab first code-point so emoji-as-name doesn't blow up.
  const first = Array.from(trimmed)[0] ?? '?';
  return first.toUpperCase();
}

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}$${dollars}.${remainder.toString().padStart(2, '0')}`;
}

/** Parses "$1,234.56" / "1234.56" / "  12 " / "" -> integer cents.
 *  Returns null when the input is empty or unparseable (caller treats as no-op). */
function parseCents(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.\-]/g, '').trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

// ---- component --------------------------------------------------------------

export default function RoommateRow({
  roommate,
  split,
  computedAmountCents,
  onSave,
  onDelete,
  isLandlord,
}: RoommateRowProps) {
  // Local-controlled name so typing feels instant; commit on blur / Enter.
  const [name, setName] = useState(roommate.name);
  useEffect(() => setName(roommate.name), [roommate.name]);

  const hasPercent =
    split.override_percent !== null && split.override_percent !== undefined;
  const hasCents =
    split.override_cents !== null && split.override_cents !== undefined;

  // Override input is shown whenever any override is set; its draft value is
  // local so typing doesn't fight the parent's optimistic state.
  const [overrideDraft, setOverrideDraft] = useState<string>(() =>
    hasCents ? formatCents(split.override_cents as number) : formatCents(computedAmountCents),
  );
  useEffect(() => {
    if (hasCents) {
      setOverrideDraft(formatCents(split.override_cents as number));
    } else if (hasPercent) {
      // For percent overrides the input mirrors the computed amount.
      setOverrideDraft(formatCents(computedAmountCents));
    }
  }, [hasCents, hasPercent, split.override_cents, computedAmountCents]);

  function commitName() {
    const next = name.trim();
    if (!next || next === roommate.name) {
      setName(roommate.name);
      return;
    }
    onSave({ name: next });
  }

  function commitOverride() {
    const cents = parseCents(overrideDraft);
    if (cents === null) return;
    // Editing the override input always means an explicit cents override
    // (a percent override edited numerically converts into cents; the parent
    // can choose to interpret a near-equal-share value as "clear" if it wants).
    onSave({ override_cents: cents, override_percent: null });
  }

  return (
    <div className="roommate-row">
      <div className="roommate-left">
        <div className="roommate-avatar">{initialOf(name)}</div>
        <input
          className="roommate-name-edit"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setName(roommate.name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label="Roommate name"
        />
        {hasPercent && (
          <span className="discount-pill">{`−${split.override_percent}%`}</span>
        )}
        {hasCents && !hasPercent && <span className="override-pill">override</span>}
        {!hasPercent && !hasCents && isLandlord && (
          <span className="tag-pill">landlord</span>
        )}
        <button
          type="button"
          className="row-delete"
          onClick={onDelete}
          aria-label={`Remove ${roommate.name}`}
        >
          ×
        </button>
      </div>

      {hasPercent || hasCents ? (
        <input
          className="override-input"
          type="text"
          inputMode="decimal"
          value={overrideDraft}
          onChange={(e) => setOverrideDraft(e.target.value)}
          onBlur={commitOverride}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setOverrideDraft(
                hasCents
                  ? formatCents(split.override_cents as number)
                  : formatCents(computedAmountCents),
              );
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label="Override amount"
        />
      ) : (
        <span className="roommate-amount">{formatCents(computedAmountCents)}</span>
      )}
    </div>
  );
}
