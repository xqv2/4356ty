// src/app/page.tsx
// Root entry. Server component. Bounces to /cycle/current when signed in,
// /login otherwise.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/cycle/current');
  }
  redirect('/login');
}
