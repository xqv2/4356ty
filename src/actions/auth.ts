'use server';

import { redirect } from 'next/navigation';
import { setSession, clearSession } from '@/lib/auth';

export async function loginWithPin(pin: string): Promise<{ error?: string }> {
  const adminPin = process.env.ADMIN_PIN;
  if (!adminPin) return { error: 'Auth not configured on the server.' };
  if (pin !== adminPin) return { error: 'Wrong PIN.' };
  await setSession(pin);
  return {};
}

export async function logout(): Promise<void> {
  await clearSession();
  redirect('/login');
}
