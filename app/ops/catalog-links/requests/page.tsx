/**
 * Catalog Requests Page
 *
 * Lists quote and sample requests from retailers.
 * REPs see only their assigned requests, ADMINs see all.
 */

import { Suspense } from 'react';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/authOptions';
import { listCatalogRequests, getRequestCountsByStatus } from '@/lib/services/catalogLinkService';
import { RequestsClient } from './RequestsClient';

export const dynamic = 'force-dynamic';

export default async function CatalogRequestsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect('/login');
  }

  if (session.user.role !== 'ADMIN' && session.user.role !== 'REP') {
    redirect('/');
  }

  // For REP users, only show their assigned requests
  const assignedToId = session.user.role === 'ADMIN' ? undefined : session.user.id;

  const [{ requests, total }, counts] = await Promise.all([
    listCatalogRequests({ assignedToId, limit: 50 }),
    getRequestCountsByStatus(assignedToId)
  ]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Quote & Sample Requests</h1>
        <p className="text-gray-500 mt-1">
          Manage requests from retailers browsing your catalogs
        </p>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <RequestsClient
          initialRequests={requests}
          initialTotal={total}
          initialCounts={counts}
          userRole={session.user.role}
        />
      </Suspense>
    </div>
  );
}
