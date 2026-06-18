'use client';

// src/components/MessagePreview.tsx
// "Message preview" section under the editor — auto-builds the equal-split
// group copy via lib/message.generateMessage() and exposes a Copy button
// (Rausch) that copies the text to the clipboard with brief "Copied ✓"
// feedback. Mirrors mockup 5-filled.html.

import { useMemo, useState } from 'react';

import { generateMessage } from '@/lib/message';
import type {
  Bill,
  Cycle,
  CycleSplit,
  ComputedSplit,
  Roommate,
  RoommateSplit,
} from '@/lib/types';

export interface MessagePreviewProps {
  cycle: Cycle;
  bills: Bill[];
  roommates: Roommate[];
  splits: CycleSplit[];
  computedSplit: ComputedSplit;
}

export default function MessagePreview({
  cycle,
  bills,
  roommates,
  splits,
  computedSplit,
}: MessagePreviewProps) {
  // Build the RoommateSplit[] that generateMessage() expects from the raw
  // entities + the already-computed per-roommate cents.
  const roommateSplits = useMemo<RoommateSplit[]>(() => {
    const splitByRoommate = new Map<string, CycleSplit>();
    for (const s of splits) splitByRoommate.set(s.roommate_id, s);
    const centsByRoommate = new Map<string, number>();
    for (const r of computedSplit.perRoommate) centsByRoommate.set(r.id, r.cents);
    const equal = computedSplit.equalShareCents;

    return roommates.map((r) => {
      const s = splitByRoommate.get(r.id);
      const cents = centsByRoommate.get(r.id) ?? 0;

      let override: RoommateSplit['override'] = null;
      if (s?.override_cents != null && s.override_cents > 0) {
        override = { kind: 'cents', cents: s.override_cents };
      } else if (s?.override_percent != null) {
        const pct = s.override_percent;
        const saved = Math.max(0, equal - cents);
        override = { kind: 'percent', percent: pct, saved_cents: saved };
      }

      return {
        roommate_id: r.id,
        name: r.name,
        cents,
        equal_share_cents: equal,
        is_payer: false,
        override,
        tag: null,
      };
    });
  }, [roommates, splits, computedSplit]);

  const message = useMemo(
    () => generateMessage(cycle, bills, roommateSplits),
    [cycle, bills, roommateSplits],
  );

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
      } else {
        // Legacy fallback — works in older browsers / non-secure contexts.
        const ta = document.createElement('textarea');
        ta.value = message;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Silent — user can still select & copy the visible text.
    }
  };

  return (
    <div className="section">
      <div className="section-head">
        <div className="section-title">Message preview</div>
      </div>
      <div className="message-card" style={{ whiteSpace: 'pre-wrap' }}>
        {message}
      </div>
      <button
        type="button"
        className="copy-btn"
        onClick={handleCopy}
        aria-live="polite"
      >
        {copied ? 'Copied ✓' : 'Copy message'}
      </button>
    </div>
  );
}
