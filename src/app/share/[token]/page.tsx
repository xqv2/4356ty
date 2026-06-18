// src/app/share/[token]/page.tsx
// Anonymous per-roommate proof page. No auth required.

import { notFound, redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import ShareView from '@/components/ShareView';
import { computeSplit } from '@/lib/split';
import { isExpired } from '@/lib/tokens';
import type { Bill, Cycle, CycleSplit, Roommate, ShareToken } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ token: string }>;
}

const PDF_SIGNED_URL_TTL = 60 * 60 * 24 * 7;

export default async function SharePage({ params }: PageProps) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: tokenRow } = await supabase
    .from('share_tokens')
    .select('token, cycle_id, roommate_id, expires_at, created_at')
    .eq('token', token)
    .maybeSingle<ShareToken>();

  if (!tokenRow) notFound();

  if (isExpired(tokenRow.expires_at)) {
    redirect(`/share/${token}/expired`);
  }

  const [cycleRes, billsRes, roommateRes, splitsRes] = await Promise.all([
    supabase
      .from('cycles')
      .select('id, user_id, label, year, month, created_at')
      .eq('id', tokenRow.cycle_id)
      .maybeSingle(),
    supabase
      .from('bills')
      .select('id, cycle_id, vendor, provider, amount_cents, pdf_path, recurring, kind, position, created_at')
      .eq('cycle_id', tokenRow.cycle_id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('roommates')
      .select('id, user_id, name, position, archived_at, created_at')
      .eq('id', tokenRow.roommate_id)
      .maybeSingle(),
    supabase
      .from('cycle_splits')
      .select('cycle_id, roommate_id, override_cents, override_percent, animal')
      .eq('cycle_id', tokenRow.cycle_id),
  ]);

  if (!cycleRes.data || !roommateRes.data) notFound();

  const cycle = cycleRes.data as Cycle;
  const bills = (billsRes.data ?? []) as Bill[];
  const roommate = roommateRes.data as Roommate;
  const splits = (splitsRes.data ?? []) as CycleSplit[];

  const { data: allRoommatesData } = await supabase
    .from('roommates')
    .select('id, user_id, name, position, archived_at, created_at')
    .eq('user_id', cycle.user_id)
    .is('archived_at', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  const allRoommates = (allRoommatesData ?? [roommate]) as Roommate[];
  const totalCents = bills.reduce((s, b) => s + (b.amount_cents || 0), 0);
  const splitsByRoommate = new Map<string, CycleSplit>();
  for (const s of splits) splitsByRoommate.set(s.roommate_id, s);

  const computed = computeSplit(
    totalCents,
    allRoommates.map((r) => {
      const s = splitsByRoommate.get(r.id);
      return { id: r.id, override_cents: s?.override_cents ?? null, override_percent: s?.override_percent ?? null };
    }),
  );

  const myCents = computed.perRoommate.find((p) => p.id === roommate.id)?.cents ?? 0;
  const mySplit: CycleSplit = splitsByRoommate.get(roommate.id) ?? {
    cycle_id: cycle.id,
    roommate_id: roommate.id,
    override_cents: null,
    override_percent: null,
    animal: 'otter',
  };

  const pdfUrls = await signAllPdfs(bills);

  return (
    <ShareView
      cycle={cycle}
      bills={bills}
      roommate={roommate}
      split={mySplit}
      computedAmountCents={myCents}
      equalShareCents={computed.equalShareCents}
      totalCents={totalCents}
      animal={mySplit.animal}
      pdfUrls={pdfUrls}
    />
  );
}

async function signAllPdfs(bills: Bill[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const supabase = createServiceClient();

  await Promise.all(
    bills.map(async (b) => {
      if (!b.pdf_path) { out[b.id] = null; return; }
      const { data, error } = await supabase.storage
        .from('bills')
        .createSignedUrl(b.pdf_path, PDF_SIGNED_URL_TTL);
      out[b.id] = error || !data?.signedUrl ? null : data.signedUrl;
    }),
  );

  return out;
}
