'use client';

// src/components/ShareLinksSheet.tsx
// Modal/sheet shown after generateShareLinks() resolves. Visual structure
// matches mockups/screens/4-share-links.html: dimmed overlay, centered card,
// one big CTA per equal-split group + one big CTA per discount/override
// roommate. Each CTA copies BOTH the rendered share message and the share
// URL to the clipboard, then flips to a "Copied" state for ~2s.

import { useEffect, useMemo, useState } from 'react';
import { generateMessage } from '@/lib/message';
import type { Bill, Cycle, RoommateSplit } from '@/lib/types';

export interface ShareLink {
  roommateId: string;
  name: string;
  token: string;
  url: string;
  animal: string;
  isDiscount?: boolean;
  override?: { kind: 'cents' | 'percent'; value: number };
}

export interface ShareLinksSheetProps {
  open: boolean;
  onClose: () => void;
  links: ShareLink[];
  /** Optional cycle/bills/splits — when provided we hand them to
   *  generateMessage() for full-fidelity copy. When omitted, a fallback
   *  message that just announces the link is used. */
  cycle?: Pick<Cycle, 'label' | 'year' | 'month'>;
  bills?: Bill[];
  splits?: RoommateSplit[];
}

interface EqualGroup {
  kind: 'equal';
  key: string;
  link: ShareLink;        // shared token used for all equal-split roommates
  members: ShareLink[];   // every roommate in this bucket (incl. the link's owner)
}

interface OverrideGroup {
  kind: 'override';
  key: string;
  link: ShareLink;
}

type Group = EqualGroup | OverrideGroup;

export default function ShareLinksSheet({
  open,
  onClose,
  links,
  cycle,
  bills,
  splits,
}: ShareLinksSheetProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Reset the "Copied" pill whenever the modal closes/reopens.
  useEffect(() => {
    if (!open) setCopiedKey(null);
  }, [open]);

  // ESC to dismiss.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Auto-clear the copied flag.
  useEffect(() => {
    if (!copiedKey) return;
    const t = window.setTimeout(() => setCopiedKey(null), 2000);
    return () => window.clearTimeout(t);
  }, [copiedKey]);

  const groups: Group[] = useMemo(() => buildGroups(links), [links]);

  if (!open) return null;

  const onOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleCopy = async (group: Group) => {
    const message = renderMessage(group, { cycle, bills, splits });
    try {
      await navigator.clipboard.writeText(`${message}\n\n${group.link.url}`);
      setCopiedKey(group.key);
    } catch {
      // Fallback for environments without clipboard permission — silently
      // ignore; user can long-press the URL pill to copy manually.
    }
  };

  return (
    <div
      className="share-links-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-links-title"
      onClick={onOverlayClick}
    >
      <div className="share-links-modal">
        <button
          type="button"
          className="share-links-close"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        <h2 id="share-links-title">Share with roommates</h2>
        <p className="share-links-sub">
          {groups.length > 1
            ? 'Two messages to send — same link for the equal-split group, separate one for each override.'
            : 'Tap to copy the message and link.'}
        </p>

        {groups.map((g) => {
          const copied = copiedKey === g.key;
          const isDiscount = g.kind === 'override';
          const people = peopleLabel(g);
          const amountText = amountLabel(g);
          const meta = metaLabel(g);
          const ctaLabel = copied ? 'Copied' : ctaText(g);

          return (
            <div
              key={g.key}
              className={`share-group${isDiscount ? ' discount' : ''}`}
            >
              <div className="share-group-head">
                <div className="share-group-people">
                  {people}
                  {g.kind === 'override' && g.link.override?.kind === 'percent' && (
                    <span className="discount-pill">−{g.link.override.value}%</span>
                  )}
                  {g.kind === 'override' && g.link.override?.kind === 'cents' && (
                    <span className="override-pill">custom</span>
                  )}
                </div>
                {amountText && (
                  <div className={`share-group-amount${isDiscount ? ' discount' : ''}`}>
                    {amountText}
                  </div>
                )}
              </div>
              <div className="share-group-meta">{meta}</div>
              <div className="share-group-url">{prettyUrl(g.link.url)}</div>
              <button
                type="button"
                className="share-group-cta"
                onClick={() => handleCopy(g)}
                aria-live="polite"
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
                {ctaLabel}
              </button>
            </div>
          );
        })}

        <div className="share-links-footer">
          <span className="share-links-meta">Links expire in 5 days</span>
          <button type="button" className="share-links-done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Group construction ----------------------------------------------------

function buildGroups(links: ShareLink[]): Group[] {
  const equalMembers = links.filter((l) => !l.isDiscount && !l.override);
  const overrideLinks = links.filter((l) => l.isDiscount || l.override);

  const groups: Group[] = [];

  if (equalMembers.length > 0) {
    // The first equal-split token is the shared link for the whole group.
    groups.push({
      kind: 'equal',
      key: `equal-${equalMembers[0]!.token}`,
      link: equalMembers[0]!,
      members: equalMembers,
    });
  }

  for (const link of overrideLinks) {
    groups.push({
      kind: 'override',
      key: `override-${link.token}`,
      link,
    });
  }

  return groups;
}

// --- Label helpers ---------------------------------------------------------

function peopleLabel(g: Group): string {
  if (g.kind === 'equal') {
    return joinNames(g.members.map((m) => m.name));
  }
  return g.link.name;
}

function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return names.join(', ');
}

function amountLabel(_g: Group): string {
  // Amounts are intentionally not rendered when we don't have splits in
  // props — we'd rather omit the figure than print a wrong one. Callers
  // who want the dollar amount in the modal can extend the props to pass
  // `amount_cents` per link.
  return '';
}

function metaLabel(g: Group): string {
  if (g.kind === 'equal') {
    const n = g.members.length;
    return `Equal split · ${n} roommate${n === 1 ? '' : 's'} · same link for all`;
  }
  if (g.link.override?.kind === 'percent') {
    return 'Discounted · personal link with their amount';
  }
  if (g.link.override?.kind === 'cents') {
    return 'Custom amount · personal link';
  }
  return 'Personal link';
}

function ctaText(g: Group): string {
  if (g.kind === 'equal') {
    const names = g.members.map((m) => m.name);
    return `Copy message · ${joinNames(names)}`;
  }
  const pct =
    g.link.override?.kind === 'percent' ? ` (−${g.link.override.value}%)` : '';
  return `Copy message · ${g.link.name}${pct}`;
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    // Strip the protocol for a tidier mock-style line: "bills.app/share/<tok>".
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

// --- Message rendering -----------------------------------------------------

function renderMessage(
  g: Group,
  ctx: {
    cycle?: Pick<Cycle, 'label' | 'year' | 'month'>;
    bills?: Bill[];
    splits?: RoommateSplit[];
  },
): string {
  const { cycle, bills, splits } = ctx;

  // Full-fidelity path: lib/message.generateMessage when we have the data.
  if (cycle && bills && splits) {
    if (g.kind === 'equal') {
      return generateMessage(cycle, bills, splits);
    }
    const target = splits.find((s) => s.roommate_id === g.link.roommateId);
    return generateMessage(cycle, bills, splits, target);
  }

  // Fallback when the parent hasn't passed cycle/bills/splits — keep the
  // copy useful even if it's not as fancy as mockup 5.
  if (g.kind === 'equal') {
    const names = joinNames(g.members.map((m) => m.name));
    return `Hey ${names}! Here's the bill breakdown — tap the link to see each bill and your share.`;
  }
  const pct =
    g.link.override?.kind === 'percent'
      ? ` (with −${g.link.override.value}% off, just for you)`
      : '';
  return `Hey ${g.link.name}! Here's the bill breakdown${pct} — tap the link to see your share.`;
}

// --- Icons -----------------------------------------------------------------

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x={9} y={9} width={13} height={13} rx={2} />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
