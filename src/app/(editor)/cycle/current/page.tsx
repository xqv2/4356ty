// src/app/(editor)/cycle/current/page.tsx
// Server component. Resolves the cycle for the runtime's current year+month
// (creating it if missing) and redirects to /cycle/[id]. The heavy lifting
// (carry-forward of bills + roommates from the prior cycle) happens in
// `ensureCurrentCycle()` once the actions module is wired in; for now we
// inline a minimal idempotent upsert so the route is functional end-to-end.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { currentYearMonth, formatCycleLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function CurrentCyclePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { year, month } = currentYearMonth();

  // Try to fetch the existing cycle for this user/year/month first.
  const { data: existing } = await supabase
    .from('cycles')
    .select('id')
    .eq('user_id', user.id)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (existing?.id) {
    redirect(`/cycle/${existing.id}`);
  }

  // Otherwise create it. Use a defensive upsert in case two concurrent calls
  // race — the (user_id, year, month) unique constraint guarantees idempotency.
  const { data: created, error } = await supabase
    .from('cycles')
    .upsert(
      {
        user_id: user.id,
        year,
        month,
        label: defaultCycleLabel(year, month),
      },
      { onConflict: 'user_id,year,month' },
    )
    .select('id')
    .single();

  if (error || !created) {
    // Surface the failure; (editor)/error.tsx (when added) renders this.
    throw new Error(
      error?.message ?? 'Could not initialize current cycle.',
    );
  }

  redirect(`/cycle/${created.id}`);
}

/** Default human label for a fresh cycle — "April 2026 · Utilities". */
function defaultCycleLabel(year: number, month: number): string {
  return `${formatCycleLabel(year, month)} · Utilities`;
}
