// src/lib/supabase/middleware.ts
// Refreshes the Supabase session on every request. Called from src/middleware.ts.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Fail open: without env vars we can't refresh, but we shouldn't 500
    // on every page load either. Surface this in `next dev` logs.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[supabase/middleware] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY',
      );
    }
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: this call refreshes the auth tokens and rewrites cookies.
  // Don't drop it even if the user is unused — supabase needs the side effect.
  await supabase.auth.getUser();

  return response;
}
