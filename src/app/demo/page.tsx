'use client';

// src/app/demo/page.tsx
// No-auth demo page. Renders <EditorBody/> with seeded fake data so the
// editor — bills, roommates, computed totals, the counter-up animation —
// can be exercised without a Supabase project. Server actions still fire
// in the background on edits; they fail silently (no real auth) but the
// optimistic UI stays put, which is the whole point of this route.

import { useEffect, type ReactNode } from 'react';

import EditorBody from '@/components/EditorBody';
import MonthTabs from '@/components/MonthTabs';

import type {
  Bill,
  Cycle,
  CycleSplit,
  Roommate,
  ShareToken,
} from '@/lib/types';

const DEMO_USER = 'demo-user';
const DEMO_CYCLE_ID = 'demo-cycle';

const DEMO_CYCLE: Cycle = {
  id: DEMO_CYCLE_ID,
  user_id: DEMO_USER,
  label: 'APR 2026 · Utilities',
  year: 2026,
  month: 4,
  created_at: '2026-04-01T00:00:00.000Z',
};

const DEMO_BILLS: Bill[] = [
  {
    id: 'bill-electricity',
    cycle_id: DEMO_CYCLE_ID,
    vendor: 'Electricity',
    provider: 'PG&E',
    amount_cents: 13448,
    pdf_path: null,
    recurring: true,
    kind: 'electricity',
    position: 0,
    created_at: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'bill-water',
    cycle_id: DEMO_CYCLE_ID,
    vendor: 'Water',
    provider: 'SFPUC',
    amount_cents: 4200,
    pdf_path: null,
    recurring: true,
    kind: 'water',
    position: 1,
    created_at: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'bill-trash',
    cycle_id: DEMO_CYCLE_ID,
    vendor: 'Trash',
    provider: 'Recology',
    amount_cents: 1500,
    pdf_path: null,
    recurring: true,
    kind: 'trash',
    position: 2,
    created_at: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'bill-internet',
    cycle_id: DEMO_CYCLE_ID,
    vendor: 'Internet',
    provider: 'Sonic',
    amount_cents: 8000,
    pdf_path: null,
    recurring: true,
    kind: 'internet',
    position: 3,
    created_at: '2026-04-01T00:00:00.000Z',
  },
];

const DEMO_ROOMMATES: Roommate[] = [
  {
    id: 'rm-astitva',
    user_id: DEMO_USER,
    name: 'Astitva',
    position: 0,
    archived_at: null,
    lease_end_date: null,
    created_at: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'rm-bob',
    user_id: DEMO_USER,
    name: 'Bob',
    position: 1,
    archived_at: null,
    lease_end_date: null,
    created_at: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'rm-johny',
    user_id: DEMO_USER,
    name: 'Johny (landlord)',
    position: 2,
    archived_at: null,
    lease_end_date: null,
    created_at: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'rm-lokesh',
    user_id: DEMO_USER,
    name: 'Lokesh',
    position: 3,
    archived_at: null,
    lease_end_date: null,
    created_at: '2026-04-01T00:00:00.000Z',
  },
];

const DEMO_SPLITS: CycleSplit[] = [
  {
    cycle_id: DEMO_CYCLE_ID,
    roommate_id: 'rm-astitva',
    override_cents: null,
    override_percent: null,
    animal: 'fox' as never, // POOL fallback handled by RoommateRow
  },
  {
    cycle_id: DEMO_CYCLE_ID,
    roommate_id: 'rm-bob',
    override_cents: null,
    override_percent: null,
    animal: 'otter',
  },
  {
    cycle_id: DEMO_CYCLE_ID,
    roommate_id: 'rm-johny',
    override_cents: null,
    override_percent: null,
    animal: 'panda',
  },
  {
    cycle_id: DEMO_CYCLE_ID,
    roommate_id: 'rm-lokesh',
    override_cents: null,
    override_percent: 20,
    animal: 'seahorse',
  },
];

const DEMO_TOKENS: ShareToken[] = [];
const DEMO_CYCLES: Cycle[] = [DEMO_CYCLE];

export default function DemoPage(): ReactNode {
  // The (editor) layout sets body.editor-page to pick up receipt typography +
  // page background. Mirror that here so the demo route looks identical.
  useEffect(() => {
    document.body.classList.add('editor-page');
    return () => {
      document.body.classList.remove('editor-page');
    };
  }, []);

  return (
    <div className="editor-shell">
      <MonthTabs cycles={DEMO_CYCLES} activeId={DEMO_CYCLE_ID} />
      <div className="app">
        <div className="header">
          <div className="cycle-label">APR 2026 · Utilities · DEMO</div>
          <h1>This month&apos;s split</h1>
        </div>

        <EditorBody
          cycle={DEMO_CYCLE}
          initialBills={DEMO_BILLS}
          initialRoommates={DEMO_ROOMMATES}
          initialSplits={DEMO_SPLITS}
          activeTokens={DEMO_TOKENS}
          demoMode
        />
      </div>
    </div>
  );
}
