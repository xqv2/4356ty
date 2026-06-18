// src/lib/auth.ts
// Cookie-based PIN session. No Supabase auth involved.

import { createHash } from 'crypto';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

export const SESSION_COOKIE = '__bills_session';

function makeToken(pin: string): string {
  const salt = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'bills-app';
  return createHash('sha256').update(`${pin}:${salt}`).digest('hex');
}

export async function isAuthenticated(): Promise<boolean> {
  const pin = process.env.ADMIN_PIN;
  if (!pin) return false;
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  return value === makeToken(pin);
}

export function isAuthenticatedRequest(request: NextRequest): boolean {
  const pin = process.env.ADMIN_PIN;
  if (!pin) return false;
  const value = request.cookies.get(SESSION_COOKIE)?.value;
  return value === makeToken(pin);
}

export async function setSession(pin: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, makeToken(pin), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
