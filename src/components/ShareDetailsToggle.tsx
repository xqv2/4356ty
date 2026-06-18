'use client';

// src/components/ShareDetailsToggle.tsx
// Client island for the per-roommate share page. Renders the "View bills"
// toggle button + the collapsible bills list. Sits as a sibling of
// .share-summary inside the .share-shell.

import { useState } from 'react';
import type { Bill, BillKind } from '@/lib/types';
import { formatMoney } from '@/lib/format';

export interface ShareDetailsToggleProps {
  bills: Bill[];
  /** Map of bill_id -> signed PDF URL (or null when no attachment). */
  pdfUrls: Record<string, string | null>;
}

const KNOWN_KINDS: ReadonlyArray<BillKind> = [
  'electricity',
  'water',
  'trash',
  'internet',
];

function iconPathForKind(kind: BillKind | null): string {
  if (kind && (KNOWN_KINDS as readonly string[]).includes(kind)) {
    return `/icons/${kind}.png`;
  }
  return '/icons/electricity.png';
}

export default function ShareDetailsToggle({
  bills,
  pdfUrls,
}: ShareDetailsToggleProps) {
  const [open, setOpen] = useState(false);

  const toggle = () => setOpen((v) => !v);

  return (
    <>
      <button
        type="button"
        className={open ? 'share-toggle open' : 'share-toggle'}
        onClick={toggle}
        aria-expanded={open}
        aria-controls="share-details"
      >
        {open ? 'Hide bills ' : 'View bills '}
        <span className="chev" aria-hidden="true">
          ▾
        </span>
      </button>

      <div
        id="share-details"
        className={open ? 'share-details open' : 'share-details'}
      >
        <div className="share-divider-label">Bills</div>
        {bills.map((bill) => {
          const pdfUrl = pdfUrls[bill.id] ?? null;
          return (
            <div key={bill.id} className="share-detail-row">
              <div className="share-detail-vendor">
                <div className="icon">
                  <img
                    src={iconPathForKind(bill.kind)}
                    alt={bill.vendor || 'Bill'}
                  />
                </div>
                <div>
                  <div className="name">{bill.vendor}</div>
                  {bill.provider ? (
                    <div className="meta">{bill.provider}</div>
                  ) : null}
                  {pdfUrl ? (
                    <a
                      href={pdfUrl}
                      className="pdf-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      ↓ Download PDF
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="share-detail-amount">
                {formatMoney(bill.amount_cents)}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
