// src/app/auth/callback/route.ts
// Handles the redirect target for both magic-link sign-in and email-change
// confirmation. Supabase appends `?code=<pkce>` (or `?token_hash=...&type=...`
// for the legacy email-change flow); we exchange it for a session and bounce
// the user to `next` (defaults to '/').

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = sanitizeNext(url.searchParams.get('next'));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(buildErrorUrl(url, error.message));
    }
    return NextResponse.redirect(new URL(next, url.origin));
  }

  // Legacy email-change flow uses verifyOtp with token_hash.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'email' | 'email_change' | 'recovery' | 'invite' | 'signup',
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(buildErrorUrl(url, error.message));
    }
    return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(buildErrorUrl(url, 'Missing code'));
}

/** Only allow same-origin relative redirects to prevent open-redirects. */
function sanitizeNext(raw: string | null): string {
  if (!raw) return '/';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/';
}

function buildErrorUrl(origin: URL, message: string): URL {
  const u = new URL('/login', origin.origin);
  u.searchParams.set('error', message);
  return u;
}
