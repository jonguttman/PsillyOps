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
    secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production"
  });
  
  const isAuthenticated = !!token;
  const userRole = token?.role as string;

  // Public routes
  const publicRoutes = ['/login', '/qr', '/verify', '/seal', '/tripdar', '/catalog'];
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // Partner routes - special handling
  const partnerPublicRoutes = ['/partner/login'];
  const partnerProtectedRoutes = ['/partner'];
  const partnerRoles = ['PARTNER_ADMIN', 'PARTNER_OPERATOR'];
  const isPartnerRoute = pathname.startsWith('/partner');
  const isPartnerPublicRoute = partnerPublicRoutes.some(route => pathname.startsWith(route));
  const isPartnerProtectedRoute = partnerProtectedRoutes.some(route => 
    pathname.startsWith(route) && !isPartnerPublicRoute
  );

  // Partner route protection
  if (isPartnerRoute) {
    if (isPartnerPublicRoute) {
      // Allow access to partner login
      return NextResponse.next();
    }
    
    if (isPartnerProtectedRoute) {
      // Require authentication and partner role
      if (!isAuthenticated || !partnerRoles.includes(userRole)) {
        const loginUrl = new URL('/partner/login', req.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
      }
      return NextResponse.next();
    }
  }

  // Block partner users from accessing /ops/* routes
  if (pathname.startsWith('/ops') && partnerRoles.includes(userRole)) {
    return NextResponse.redirect(new URL('/partner', req.url));
  }

  // Redirect to login if not authenticated and trying to access protected route
  if (!isAuthenticated && !isPublicRoute) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Rep-specific routes
  if (pathname.startsWith('/(rep)') || pathname.startsWith('/rep')) {
    if (userRole !== 'REP' && userRole !== 'ADMIN') {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except:
    // - api routes
    // - Next.js internals (_next/static, _next/image)
    // - Static files (favicon, images, SVGs, etc.)
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.webp$|.*\\.ico$).*)',
  ]
};
