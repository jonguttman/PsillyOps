// Middleware for route protection

import { auth } from '@/lib/auth/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth;

  // Public routes
  const publicRoutes = ['/login', '/qr'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // Redirect to login if not authenticated and trying to access protected route
  if (!isAuthenticated && !isPublicRoute) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Rep-specific routes
  if (pathname.startsWith('/(rep)') || pathname.startsWith('/rep')) {
    if (req.auth?.user.role !== 'REP' && req.auth?.user.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ]
};


