// src/lib/auth.ts
// Cookie-based PIN session. Uses Web Crypto API (Edge + Node compatible).

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

export const SESSION_COOKIE = '__bills_session';

async function makeToken(pin: string): Promise<string> {
  const salt = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'bills-app';
  const data = new TextEncoder().encode(`${pin}:${salt}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function isAuthenticated(): Promise<boolean> {
  const pin = process.env.ADMIN_PIN;
  if (!pin) return false;
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  return value === (await makeToken(pin));
}

export async function isAuthenticatedRequest(request: NextRequest): Promise<boolean> {
  const pin = process.env.ADMIN_PIN;
  if (!pin) return false;
  const value = request.cookies.get(SESSION_COOKIE)?.value;
  return value === (await makeToken(pin));
}

export async function setSession(pin: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await makeToken(pin), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
