// src/middleware.ts
// PIN session gate. Redirects unauthenticated requests to /login.

import { NextResponse, type NextRequest } from 'next/server';
import { isAuthenticatedRequest } from '@/lib/auth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname === '/login' ||
    pathname.startsWith('/share/') ||
    pathname === '/demo';

  if (isPublic) return NextResponse.next();

  if (!isAuthenticatedRequest(request)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf|map)$).*)',
  ],
};
