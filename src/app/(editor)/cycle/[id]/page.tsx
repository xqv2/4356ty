// src/app/(editor)/cycle/[id]/page.tsx
// Server component. Fetches the cycle + its bills + roommates + cycle_splits
// + active share tokens, then hands them to <EditorBody/> as initial state.
// All interactivity (typing into a bill amount, recompute, save) lives in
// the client component so the UI reacts on the same tick.

import { notFound, redirect } from 'next/navigation';

import EditorBody from '@/components/EditorBody';

import { formatCycleLabel } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import type {
  Bill,
  Cycle,
  CycleSplit,
  Roommate,
  ShareToken,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CycleEditorPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [cycleRes, billsRes, roommatesRes, splitsRes, tokensRes] =
    await Promise.all([
      supabase
        .from('cycles')
        .select('id, user_id, label, year, month, created_at')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('bills')
        .select(
          'id, cycle_id, vendor, provider, amount_cents, pdf_path, recurring, kind, position, created_at',
        )
        .eq('cycle_id', id)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('roommates')
        .select('id, user_id, name, position, archived_at, created_at')
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('cycle_splits')
        .select(
          'cycle_id, roommate_id, override_cents, override_percent, animal',
        )
        .eq('cycle_id', id),
      supabase
        .from('share_tokens')
        .select('token, cycle_id, roommate_id, expires_at, created_at')
        .eq('cycle_id', id),
    ]);

  if (!cycleRes.data) {
    notFound();
  }

  const cycle = cycleRes.data as Cycle;
  const bills = (billsRes.data ?? []) as Bill[];
  const roommates = (roommatesRes.data ?? []) as Roommate[];
  const splits = (splitsRes.data ?? []) as CycleSplit[];
  const tokens = (tokensRes.data ?? []) as ShareToken[];

  const now = Date.now();
  const activeTokens = tokens.filter(
    (t) => Date.parse(t.expires_at) > now,
  );

  const cycleHeaderLabel = `${formatCycleLabel(cycle.year, cycle.month)} · ${
    cycle.label?.includes('·')
      ? cycle.label.split('·').slice(1).join('·').trim()
      : cycle.label || 'Utilities'
  }`;

  return (
    <>
      <div className="header">
        <div className="cycle-label">{cycleHeaderLabel}</div>
        <h1>This month&apos;s split</h1>
      </div>

      <EditorBody
        cycle={cycle}
        initialBills={bills}
        initialRoommates={roommates}
        initialSplits={splits}
        activeTokens={activeTokens}
      />
    </>
  );
}
