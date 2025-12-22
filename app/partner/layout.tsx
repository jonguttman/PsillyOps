/**
 * Partner Portal Layout
 * 
 * Phase 2B NOTE:
 * This portal provides structural scaffolding for partner operations.
 * Full mobile batch-binding workflow is implemented in Phase 2C.
 * 
 * Phase 2B intentionally does NOT implement:
 * - Mobile batch scanning
 * - Timed scan windows
 * - Anti-sharing enforcement
 * - Device-level binding locks
 */

export const runtime = "nodejs";
import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { isPartnerUser } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';

export default async function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Only check auth on protected routes (login page handles its own auth)
  // This layout is used for all partner routes including login
  
  return (
    <div className="min-h-screen bg-gray-50">
      {session && isPartnerUser(session.user.role as UserRole) ? (
        <>
          {/* Header */}
          <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between h-14 items-center">
                <div className="flex items-center">
                  <Link href="/partner" className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-gray-900">TripDAR Partner Portal</h1>
                  </Link>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-700">{session.user.name}</span>
                  <Link
                    href="/api/auth/signout"
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Sign out
                  </Link>
                </div>
              </div>
            </div>
          </header>

          {/* Navigation */}
          <nav className="bg-white border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex space-x-8">
                <Link
                  href="/partner"
                  className="border-b-2 border-blue-500 py-4 px-1 text-sm font-medium text-gray-900"
                >
                  Dashboard
                </Link>
                <Link
                  href="/partner/products"
                  className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                >
                  Products
                </Link>
                <Link
                  href="/partner/seals"
                  className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                >
                  Seal Sheets
                </Link>
                <Link
                  href="/partner/bind"
                  className="border-b-2 border-transparent py-4 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300"
                >
                  Bind Seals
                </Link>
              </div>
            </div>
          </nav>

          {/* Main Content */}
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </>
      ) : (
        // Not authenticated or not partner user - show children (login page)
        children
      )}
    </div>
  );
}

