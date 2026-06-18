// src/app/(editor)/cycle/current/page.tsx
import { redirect } from 'next/navigation';
import { ensureCurrentCycle } from '@/actions/cycles';

export const dynamic = 'force-dynamic';

export default async function CurrentCyclePage() {
  const cycle = await ensureCurrentCycle();
  redirect(`/cycle/${cycle.year}-${String(cycle.month).padStart(2, '0')}`);
}
