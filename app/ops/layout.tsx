export const runtime = "nodejs";
import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { canUseAICommand } from '@/lib/auth/rbac';
import AiCommandButton from '@/components/ai/AiCommandButton';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { MobileShell } from '@/components/mobile';

export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  // Note: REP access control is handled by middleware.ts
  // REPs can access specific /ops routes (e.g., /ops/catalog-links)
  // Middleware redirects REPs to /rep for non-allowed routes

  return (
    <>
      {/* ========================================
          Desktop Shell - hidden on mobile (< md)
          ======================================== */}
      <div className="hidden md:flex min-h-screen bg-gray-50 flex-col">
        {/* Header - Clean top bar with logo, AI button, and user menu only */}
        <header className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-14 items-center">
              <div className="flex items-center">
                <Link href="/ops/dashboard" className="flex items-center gap-2">
                  <Image
                    src="/PsillyMark-2026.svg"
                    alt="PsillyOps logo"
                    width={28}
                    height={28}
                    priority
                  />
                  <h1 className="text-xl font-bold text-gray-900">PsillyOps</h1>
                </Link>
                <span className="ml-3 px-2 py-0.5 text-xs font-medium text-gray-500 bg-gray-100 rounded">
                  {session.user.role}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <AiCommandButton canUseAI={canUseAICommand(session.user.role)} />
                <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
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
          </div>
        </header>

        {/* Main layout with sidebar and content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <aside className="flex-shrink-0">
            <SidebarNav userRole={session.user.role} />
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-6 py-8">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* ========================================
          Mobile Shell - hidden on desktop (>= md)
          CSS breakpoint switching: no hydration issues, no flicker
          ======================================== */}
      <div className="block md:hidden">
        <MobileShell userRole={session.user.role}>
          {children}
        </MobileShell>
      </div>
    </>
  );
}
