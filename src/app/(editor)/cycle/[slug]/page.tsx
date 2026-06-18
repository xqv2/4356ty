// src/app/(editor)/cycle/[slug]/page.tsx
import { notFound } from 'next/navigation';
import EditorBody from '@/components/EditorBody';
import { formatCycleLabel } from '@/lib/format';
import { createServiceClient, getAdminUserId } from '@/lib/supabase/service';
import type { Bill, Cycle, CycleSplit, Roommate, ShareToken } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CycleEditorPage({ params }: PageProps) {
  const { slug } = await params;
  // slug format: "YYYY-MM", e.g. "2026-04"
  const [yearStr, monthStr] = slug.split('-');
  const year = parseInt(yearStr ?? '', 10);
  const month = parseInt(monthStr ?? '', 10);

  if (!year || !month || month < 1 || month > 12) notFound();

  const supabase = createServiceClient();
  const userId = getAdminUserId();

  const cycleRes = await supabase
    .from('cycles')
    .select('id, user_id, label, year, month, created_at')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (!cycleRes.data) notFound();

  const cycle = cycleRes.data as Cycle;
  const id = cycle.id;

  const [billsRes, roommatesRes, splitsRes, tokensRes] =
    await Promise.all([
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
        .eq('user_id', userId)
        .is('archived_at', null)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('cycle_splits')
        .select('cycle_id, roommate_id, override_cents, override_percent, animal')
        .eq('cycle_id', id),
      supabase
        .from('share_tokens')
        .select('token, cycle_id, roommate_id, expires_at, created_at')
        .eq('cycle_id', id),
    ]);

  const bills = (billsRes.data ?? []) as Bill[];
  const roommates = (roommatesRes.data ?? []) as Roommate[];
  const splits = (splitsRes.data ?? []) as CycleSplit[];
  const tokens = (tokensRes.data ?? []) as ShareToken[];
  const activeTokens = tokens.filter((t) => Date.parse(t.expires_at) > Date.now());

  const monthName = formatCycleLabel(cycle.year, cycle.month).split(' ')[0];

  return (
    <>
      <div className="header">
        <h1>{monthName} Split</h1>
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
