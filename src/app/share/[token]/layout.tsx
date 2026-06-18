// src/app/share/[token]/layout.tsx
// Isolated layout for the per-roommate proof page. NO editor chrome — just a
// neutral wrapper that paints the warm beige body background from mockup 6.
// The actual cream paper, dotted texture, and torn-edge mask live on
// .share-shell inside the rendered page. We avoid setting body class via JS
// here so the page stays a pure server component.

import type { ReactNode } from 'react';

const WARM_BEIGE = '#e8e3d8';
const CREAM = '#fffef8';

export default function ShareLayout({ children }: { children: ReactNode }) {
  // The wrapping <div> takes the full viewport height and paints the warm
  // beige outside the cream paper card. On narrow viewports the share-shell
  // CSS flips to a full-bleed cream layout (mockup 6 media query).
  return (
    <div
      className="share-page-frame"
      style={{
        minHeight: '100vh',
        background: WARM_BEIGE,
        backgroundImage: `radial-gradient(circle at 25% 30%, rgba(0,0,0,0.014) 1px, transparent 1px), radial-gradient(circle at 70% 80%, rgba(0,0,0,0.014) 1px, transparent 1px)`,
        backgroundSize: '18px 18px, 28px 28px',
        // Center the receipt on wider viewports.
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 'max(48px, calc(env(safe-area-inset-top) + 24px)) 12px 64px',
        // Mobile fallback bg matches the cream paper (per mockup 6 @media).
        ['--share-cream' as string]: CREAM,
      }}
    >
      {children}
    </div>
  );
}
