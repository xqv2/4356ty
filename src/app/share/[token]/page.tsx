// src/app/share/[token]/page.tsx
// Anonymous per-roommate proof page. Server component:
//   1. Look up the share_token (anon SELECT is allowed by RLS).
//   2. Bounce to /share/[token]/expired when past expires_at.
//   3. notFound() when missing.
//   4. Hydrate cycle + bills + roommate + cycle_split via the same anon
//      client (RLS still allows the rows because they cascade from the token
//      lookup pattern; for fields RLS would block, fall back to a service-
//      role client when SUPABASE_SERVICE_ROLE_KEY is configured).
//   5. Compute this roommate's owed cents via lib/split.
//   6. Sign each PDF for ~7 days when SUPABASE_SERVICE_ROLE_KEY is present.
//   7. Render <ShareView/>.

import { notFound, redirect } from 'next/navigation';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { createClient as createBaseSupabase } from '@supabase/supabase-js';
import ShareView from '@/components/ShareView';
import { computeSplit } from '@/lib/split';
import { isExpired } from '@/lib/tokens';
import type {
  Bill,
  Cycle,
  CycleSplit,
  Roommate,
  ShareToken,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ token: string }>;
}

const PDF_SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

export default async function SharePage({ params }: PageProps) {
  const { token } = await params;

  // Anonymous client (uses the user's session if any, otherwise anon role).
  const supabase = await createServerSupabase();

  const { data: tokenRow } = await supabase
    .from('share_tokens')
    .select('token, cycle_id, roommate_id, expires_at, created_at')
    .eq('token', token)
    .maybeSingle<ShareToken>();

  if (!tokenRow) notFound();

  if (isExpired(tokenRow.expires_at)) {
    redirect(`/share/${token}/expired`);
  }

  // For data behind RLS that's keyed by user_id (cycles, bills, roommates,
  // cycle_splits), we need a service-role client to read on behalf of the
  // anonymous proof page. When the env var isn't set we fall back to the
  // anon client and rely on whatever read policies exist; this matches the
  // dev-friendly "fail open" stance from middleware.ts.
  const reader = createReaderClient() ?? supabase;

  const [cycleRes, billsRes, roommateRes, splitsRes] = await Promise.all([
    reader
      .from('cycles')
      .select('id, user_id, label, year, month, created_at')
      .eq('id', tokenRow.cycle_id)
      .maybeSingle(),
    reader
      .from('bills')
      .select(
        'id, cycle_id, vendor, provider, amount_cents, pdf_path, recurring, kind, position, created_at',
      )
      .eq('cycle_id', tokenRow.cycle_id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }),
    reader
      .from('roommates')
      .select('id, user_id, name, position, archived_at, created_at')
      .eq('id', tokenRow.roommate_id)
      .maybeSingle(),
    reader
      .from('cycle_splits')
      .select('cycle_id, roommate_id, override_cents, override_percent, animal')
      .eq('cycle_id', tokenRow.cycle_id),
  ]);

  if (!cycleRes.data || !roommateRes.data) {
    notFound();
  }

  const cycle = cycleRes.data as Cycle;
  const bills = (billsRes.data ?? []) as Bill[];
  const roommate = roommateRes.data as Roommate;
  const splits = (splitsRes.data ?? []) as CycleSplit[];

  // Need ALL roommates to compute the equal-share baseline correctly, even
  // though we only render this one user's proof. Pull them via the reader.
  const { data: allRoommatesData } = await reader
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
      return {
        id: r.id,
        override_cents: s?.override_cents ?? null,
        override_percent: s?.override_percent ?? null,
      };
    }),
  );

  const myCents =
    computed.perRoommate.find((p) => p.id === roommate.id)?.cents ?? 0;
  const mySplit: CycleSplit = splitsByRoommate.get(roommate.id) ?? {
    cycle_id: cycle.id,
    roommate_id: roommate.id,
    override_cents: null,
    override_percent: null,
    animal: 'otter',
  };

  // Sign each PDF (when we have the service-role client + a path).
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

// ---- helpers --------------------------------------------------------------

/**
 * Service-role Supabase client used for the anonymous proof page. Returns
 * null when SUPABASE_SERVICE_ROLE_KEY isn't configured — caller falls back
 * to the cookie-bound anon client.
 */
function createReaderClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createBaseSupabase(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signAllPdfs(
  bills: Bill[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const reader = createReaderClient();

  if (!reader) {
    for (const b of bills) out[b.id] = null;
    return out;
  }

  await Promise.all(
    bills.map(async (b) => {
      if (!b.pdf_path) {
        out[b.id] = null;
        return;
      }
      const { data, error } = await reader.storage
        .from('bills')
        .createSignedUrl(b.pdf_path, PDF_SIGNED_URL_TTL);
      out[b.id] = error || !data?.signedUrl ? null : data.signedUrl;
    }),
  );

  return out;
}
