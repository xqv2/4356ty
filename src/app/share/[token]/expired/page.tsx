// src/app/share/[token]/expired/page.tsx
// Friendly expired-link page. Server component — kept dead simple so it
// inherits the parent share/[token]/layout.tsx warm-beige background and
// feels of-a-piece with the proof receipt. Mirrors the receipt aesthetic:
// a small cream card with a stamped "EXPIRED" tag and a one-line
// explanation. The page is intentionally a dead-end — there's no auth on
// this surface, so we don't link back to the editor.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Bills — Link expired',
  robots: { index: false, follow: false },
};

export default function ExpiredSharePage() {
  return (
    <div
      className="share-shell"
      style={{
        background: '#fffef8',
        maxWidth: 560,
        margin: '0 auto',
        minHeight: 'auto',
        padding: '72px 36px 48px',
        textAlign: 'center',
      }}
    >
      <div
        className="bill-stamp"
        style={{
          position: 'absolute',
          top: 18,
          right: 18,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          padding: '4px 10px',
          border: '1px dashed rgba(0,0,0,0.25)',
          transform: 'rotate(3deg)',
        }}
      >
        Expired
      </div>

      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          fontWeight: 600,
          marginBottom: 18,
        }}
      >
        This link has expired
      </div>

      <h1
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '-0.6px',
          marginBottom: 12,
        }}
      >
        Ask for a fresh one
      </h1>

      <p
        style={{
          fontSize: 14,
          color: 'var(--muted)',
          lineHeight: 1.6,
          maxWidth: 360,
          margin: '0 auto',
        }}
      >
        Share links are valid for 5 days. Ping the person who sent it for an
        updated link.
      </p>

      <div
        style={{
          marginTop: 32,
          paddingTop: 18,
          borderTop: '1px dashed rgba(0,0,0,0.18)',
          fontFamily: '"Libre Barcode 39", monospace',
          fontSize: 38,
          letterSpacing: 1,
          color: '#1a1a1a',
          opacity: 0.6,
        }}
      >
        *EXPIRED*
      </div>
    </div>
  );
}
