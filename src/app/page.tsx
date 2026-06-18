// src/app/page.tsx
import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';

export default async function HomePage() {
  const authed = await isAuthenticated();
  if (authed) redirect('/cycle/current');
  redirect('/login');
}
