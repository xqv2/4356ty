'use client';

// src/app/(editor)/_chrome.tsx
// Client wrapper that:
//   - Sets `body.className = 'editor-page'` on mount (and clears on unmount).
//   - Derives the active cycle id from the current pathname via usePathname()
//     so MonthTabs highlights the right tab without prop drilling.
//   - Renders the editor-shell + MonthTabs + .app frame around {children}.
//
// All state above this component is server-rendered (cycle list); this island
// just handles the cosmetic body class + URL-driven active highlight.

import { useEffect, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import MonthTabs from '@/components/MonthTabs';
import type { Cycle } from '@/lib/types';

const CYCLE_ID_RE = /^\/cycle\/(\d{4}-\d{2})\b/;

export interface EditorChromeProps {
  cycles: Cycle[];
  children: ReactNode;
  onAddNextMonth?: () => Promise<void>;
}

export default function EditorChrome({ cycles, children, onAddNextMonth }: EditorChromeProps) {
  const pathname = usePathname() || '/';

  useEffect(() => {
    document.body.classList.add('editor-page');
    return () => {
      document.body.classList.remove('editor-page');
    };
  }, []);

  const activeId = useMemo(() => {
    const match = pathname.match(CYCLE_ID_RE);
    const candidate = match?.[1] ?? '';
    if (!candidate || candidate === 'current') return '';
    return candidate;
  }, [pathname]);

  return (
    <div className="editor-shell">
      <MonthTabs cycles={cycles} activeId={activeId} onAddNextMonth={onAddNextMonth} />
      <div className="app">{children}</div>
    </div>
  );
}
