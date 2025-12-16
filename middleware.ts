// Middleware for route protection
// IMPORTANT: Keep this file lightweight - no Prisma or heavy dependencies!

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  
  // Get the JWT token to check authentication
  const token = await getToken({ 
    req, 
    secret: process.env.AUTH_SECRET 
  });
  
  const isAuthenticated = !!token;

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
    const userRole = token?.role as string;
    if (userRole !== 'REP' && userRole !== 'ADMIN') {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ]
};
