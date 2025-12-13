import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { canUseAICommand } from '@/lib/auth/rbac';
import AiCommandButton from '@/components/ai/AiCommandButton';

export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  // Reps use separate portal
  if (session.user.role === 'REP') {
    redirect('/rep');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">PsillyOps</h1>
              <span className="ml-3 text-sm text-gray-500">
                {session.user.role}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <AiCommandButton canUseAI={canUseAICommand(session.user.role)} />
              <span className="text-sm text-gray-700">{session.user.name}</span>
              <Link
                href="/api/auth/signout"
                className="text-sm text-gray-600 hover:text-gray-900"
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
          <div className="flex space-x-8 h-12 items-center text-sm">
            <Link href="/dashboard" className="text-gray-900 hover:text-blue-600">
              Dashboard
            </Link>
            <Link href="/products" className="text-gray-600 hover:text-blue-600">
              Products
            </Link>
            <Link href="/materials" className="text-gray-600 hover:text-blue-600">
              Materials
            </Link>
            <Link href="/vendors" className="text-gray-600 hover:text-blue-600">
              Vendors
            </Link>
            <Link href="/inventory" className="text-gray-600 hover:text-blue-600">
              Inventory
            </Link>
            <Link href="/production" className="text-gray-600 hover:text-blue-600">
              Production
            </Link>
            <Link href="/orders" className="text-gray-600 hover:text-blue-600">
              Orders
            </Link>
            <Link href="/purchase-orders" className="text-gray-600 hover:text-blue-600">
              Purchase Orders
            </Link>
            <Link href="/activity" className="text-gray-600 hover:text-blue-600">
              Activity
            </Link>
            <Link href="/ai-ingest" className="text-gray-600 hover:text-blue-600">
              AI Ingest
            </Link>
            <Link href="/labels" className="text-gray-600 hover:text-blue-600">
              Labels
            </Link>
            <Link href="/help" className="text-gray-600 hover:text-blue-600 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Help
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

