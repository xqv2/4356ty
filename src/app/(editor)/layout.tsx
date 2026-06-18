// src/app/(editor)/layout.tsx
// Auth-required wrapper for the editor surface. Server component:
//   1. Resolves the signed-in user (bounces to /login on miss).
//   2. Loads the user's cycles for <MonthTabs/>.
//   3. Wraps {children} in the editor shell exactly like mockup 5-filled:
//        <body class="editor-page">
//          <div class="editor-shell">
//            <MonthTabs ... />
//            <div class="app">{children}</div>
//          </div>
//        </body>
//
// MonthTabs needs the active cycle id which it cannot read from this layout
// alone (we don't know which /cycle/[id] the request maps to here). We pass
// `activeId=""` and let the page-level <MonthTabsClient/> swap it in via
// usePathname; alternatively each page re-renders the tabs itself. We render
// here so the chrome is consistent across the (editor) group.

import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Cycle } from '@/lib/types';
import EditorChrome from './_chrome';

export default async function EditorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: cyclesData } = await supabase
    .from('cycles')
    .select('id, user_id, label, year, month, created_at')
    .eq('user_id', user.id)
    .order('year', { ascending: true })
    .order('month', { ascending: true });

  const cycles: Cycle[] = (cyclesData ?? []) as Cycle[];

  return <EditorChrome cycles={cycles}>{children}</EditorChrome>;
}
