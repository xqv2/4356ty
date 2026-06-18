// src/app/(editor)/layout.tsx
import type { ReactNode } from 'react';
import { createServiceClient, getAdminUserId } from '@/lib/supabase/service';
import { createNextCycle } from '@/actions/cycles';
import type { Cycle } from '@/lib/types';
import EditorChrome from './_chrome';

export default async function EditorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = createServiceClient();
  const userId = getAdminUserId();

  const { data: cyclesData } = await supabase
    .from('cycles')
    .select('id, user_id, label, year, month, created_at')
    .eq('user_id', userId)
    .order('year', { ascending: true })
    .order('month', { ascending: true });

  const cycles: Cycle[] = (cyclesData ?? []) as Cycle[];

  return <EditorChrome cycles={cycles} onAddNextMonth={createNextCycle}>{children}</EditorChrome>;
}
