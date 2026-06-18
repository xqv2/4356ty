// src/middleware.ts
// Refreshes the Supabase session on every non-static, non-share request.

import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Match everything EXCEPT:
  //   - Next.js internals (_next/static, _next/image)
  //   - the favicon
  //   - any file extension (images, fonts, etc.)
  //   - /share/* — anonymous proof pages, no auth refresh needed
  //   - /demo  — no-auth seeded editor, runs without Supabase
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|share/|demo|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf|map)$).*)',
  ],
};
