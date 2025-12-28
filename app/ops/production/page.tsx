import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import ProductionKanban from './ProductionKanban';

export default async function ProductionPage() {
  const session = await auth();
  if (!session || !session.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Production</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage production orders and track progress
          </p>
        </div>
        <Link
          href="/ops/production/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          New Production Order
        </Link>
      </div>

      <ProductionKanban />
    </div>
  );
}
