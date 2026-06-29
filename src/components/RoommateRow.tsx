'use client';

import { useEffect, useState } from 'react';
import type { CycleSplit, Roommate } from '@/lib/types';

export interface RoommateRowPatch {
  name?: string;
  override_cents?: number | null;
  override_percent?: number | null;
}

export interface RoommateRowProps {
  roommate: Roommate;
  split: CycleSplit;
  computedAmountCents: number;
  onSave: (patch: RoommateRowPatch) => void;
  onCopyMessage?: () => void;
  isLandlord?: boolean;
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
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

function parseCents(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.\-]/g, '').trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

export default function RoommateRow({
  roommate,
  split,
  computedAmountCents,
  onSave,
  onCopyMessage,
  isLandlord,
}: RoommateRowProps) {
  const [name, setName] = useState(roommate.name);
  useEffect(() => setName(roommate.name), [roommate.name]);

  const [copied, setCopied] = useState(false);

  const hasPercent = split.override_percent !== null && split.override_percent !== undefined;
  const hasCents = split.override_cents !== null && split.override_cents !== undefined;

  const [overrideDraft, setOverrideDraft] = useState<string>(() =>
    hasCents ? formatCents(split.override_cents as number) : formatCents(computedAmountCents),
  );
  useEffect(() => {
    if (hasCents) {
      setOverrideDraft(formatCents(split.override_cents as number));
    } else if (hasPercent) {
      setOverrideDraft(formatCents(computedAmountCents));
    }
  }, [hasCents, hasPercent, split.override_cents, computedAmountCents]);

  function commitName() {
    const next = name.trim();
    if (!next || next === roommate.name) { setName(roommate.name); return; }
    onSave({ name: next });
  }

  function commitOverride() {
    const cents = parseCents(overrideDraft);
    if (cents === null) return;
    onSave({ override_cents: cents, override_percent: null });
  }

  // Small grey footer under the name. Replaces the previous pill chips with
  // a denser text-only descriptor that reads naturally inside the card.
  let footerLabel: string | null = null;
  if (hasPercent) {
    footerLabel = `${split.override_percent}% discount`;
  } else if (hasCents) {
    footerLabel = 'Override';
  } else if (isLandlord) {
    footerLabel = 'Landlord';
  }

  return (
    <div className="roommate-card">
      <div className="roommate-card-head">
        <div className="roommate-avatar">{initialOf(name)}</div>
        <div className="roommate-name-wrap">
          <input
            className="roommate-name-edit"
            type="text"
            size={Math.max(name.length, 3)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') { setName(roommate.name); (e.target as HTMLInputElement).blur(); }
            }}
            aria-label="Roommate name"
          />
          {footerLabel && (
            <div className="roommate-card-footer">{footerLabel}</div>
          )}
        </div>
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
              setOverrideDraft(hasCents ? formatCents(split.override_cents as number) : formatCents(computedAmountCents));
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label="Override amount"
        />
      ) : (
        <div className="roommate-card-amount">{formatCents(computedAmountCents)}</div>
      )}

      {onCopyMessage && (
        <button
          type="button"
          className={copied ? 'msg-copy-btn full copied' : 'msg-copy-btn full'}
          aria-label={copied ? 'Copied' : `Copy message for ${roommate.name}`}
          onClick={() => {
            onCopyMessage();
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x={9} y={9} width={13} height={13} rx={2} />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      )}
    </div>
  );
}
