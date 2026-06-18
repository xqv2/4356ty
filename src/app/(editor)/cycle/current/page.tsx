// src/app/(editor)/cycle/current/page.tsx
import { redirect } from 'next/navigation';
import { createServiceClient, getAdminUserId } from '@/lib/supabase/service';
import { currentYearMonth, formatCycleLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function CurrentCyclePage() {
  const supabase = createServiceClient();
  const userId = getAdminUserId();
  const { year, month } = currentYearMonth();

  const { data: existing } = await supabase
    .from('cycles')
    .select('id')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();

  if (existing?.id) redirect(`/cycle/${existing.id}`);

  const { data: created, error } = await supabase
    .from('cycles')
    .upsert(
      {
        user_id: userId,
        year,
        month,
        label: `${formatCycleLabel(year, month)} · Utilities`,
      },
      { onConflict: 'user_id,year,month' },
    )
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? 'Could not initialize current cycle.');
  }

  redirect(`/cycle/${created.id}`);
}
