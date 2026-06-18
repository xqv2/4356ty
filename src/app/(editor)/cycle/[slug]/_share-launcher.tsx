'use client';

// src/app/(editor)/cycle/[id]/_share-launcher.tsx
// Client island that owns the bottom <a class="cta">…</a> from the editor.
// On click it (a) ensures share tokens exist for this cycle by calling the
// `generateShareLinks` server action, and (b) opens the <ShareLinksSheet/>
// modal with the resulting links. Until the actions module lands, we render
// the existing tokens (passed in from the page) and surface a friendly
// "Generate share links" affordance for the empty state.

import { useState, type ReactNode } from 'react';
import ShareLinksSheet, {
  type ShareLink,
} from '@/components/ShareLinksSheet';
import type {
  Bill,
  ComputedSplit,
  Cycle,
  CycleSplit,
  Roommate,
  RoommateSplit,
  ShareToken,
} from '@/lib/types';

export interface ShareLinksLauncherProps {
  cycleId: string;
  disabled: boolean;
  cycle: Cycle;
  bills: Bill[];
  roommates: Roommate[];
  splits: CycleSplit[];
  computedSplit: ComputedSplit;
  existingTokens: ShareToken[];
  /** When true, renders as a small round FAB instead of a full-width button. */
  asFab?: boolean;
}

export default function ShareLinksLauncher({
  cycleId: _cycleId,
  disabled,
  cycle,
  bills,
  roommates,
  splits,
  computedSplit,
  existingTokens,
  asFab = false,
}: ShareLinksLauncherProps): ReactNode {
  const [open, setOpen] = useState(false);

  // Hydrate ShareLink[] from whatever tokens already exist + the splits map.
  // When `generateShareLinks` runs on click (next pass), it returns a fresh
  // ShareLinkOutput[] which we'll splice over `links`.
  const baseUrl = (() => {
    if (typeof window !== 'undefined') return window.location.origin;
    return process.env.NEXT_PUBLIC_APP_URL ?? '';
  })();

  const splitByRoommate = new Map<string, CycleSplit>();
  for (const s of splits) splitByRoommate.set(s.roommate_id, s);

  const tokenByRoommate = new Map<string, ShareToken>();
  for (const t of existingTokens) tokenByRoommate.set(t.roommate_id, t);

  const links: ShareLink[] = roommates.flatMap((r) => {
    const tok = tokenByRoommate.get(r.id);
    if (!tok) return [];
    const s = splitByRoommate.get(r.id);
    const isPercent = s?.override_percent != null;
    const isCents = s?.override_cents != null;
    return [
      {
        roommateId: r.id,
        name: r.name,
        token: tok.token,
        url: `${baseUrl}/share/${tok.token}`,
        animal: s?.animal ?? 'otter',
        isDiscount: isPercent || isCents,
        override: isPercent
          ? { kind: 'percent', value: s!.override_percent as number }
          : isCents
            ? { kind: 'cents', value: s!.override_cents as number }
            : undefined,
      },
    ];
  });

  // RoommateSplit[] for full-fidelity copy text inside the modal.
  const roommateSplits: RoommateSplit[] = roommates.map((r) => {
    const s = splitByRoommate.get(r.id);
    const cents =
      computedSplit.perRoommate.find((p) => p.id === r.id)?.cents ?? 0;
    let override: RoommateSplit['override'] = null;
    if (s?.override_cents != null && s.override_cents > 0) {
      override = { kind: 'cents', cents: s.override_cents };
    } else if (s?.override_percent != null) {
      const saved = Math.max(0, computedSplit.equalShareCents - cents);
      override = {
        kind: 'percent',
        percent: s.override_percent,
        saved_cents: saved,
      };
    }
    return {
      roommate_id: r.id,
      name: r.name,
      cents,
      equal_share_cents: computedSplit.equalShareCents,
      is_payer: false,
      override,
      tag: null,
    };
  });

  const ctaLabel = links.length
    ? 'Copy message · Open share links'
    : 'Copy message · Generate share links';

  return (
    <>
      <button
        type="button"
        className={asFab ? 'share-fab' : 'cta'}
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={asFab ? 'Share links' : ctaLabel}
      >
        {asFab ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width={20} height={20}>
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        ) : ctaLabel}
      </button>

      <ShareLinksSheet
        open={open}
        onClose={() => setOpen(false)}
        links={links}
        cycle={cycle}
        bills={bills}
        splits={roommateSplits}
      />
    </>
  );
}
