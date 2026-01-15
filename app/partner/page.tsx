/**
 * Partner Dashboard
 * 
 * Phase 2B NOTE:
 * This dashboard provides basic overview of partner data.
 * Full mobile batch-binding workflow is implemented in Phase 2C.
 */

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { isPartnerUser } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';
import { getBindingStats } from '@/lib/services/experienceBindingService';
import { listPartnerProducts } from '@/lib/services/partnerProductService';
import { getSheetsByPartner } from '@/lib/services/sealSheetService';

export default async function PartnerDashboard() {
  const session = await auth();
  
  if (!session?.user || !isPartnerUser(session.user.role as UserRole)) {
    redirect('/partner/login');
  }

  if (!session.user.partnerId) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-800">
          You are not assigned to a partner. Please contact an administrator.
        </p>
      </div>
    );
  }

  // Fetch dashboard data
  const [products, sheets, stats] = await Promise.all([
    listPartnerProducts(session.user.partnerId),
    getSheetsByPartner(session.user.partnerId),
    getBindingStats(session.user.partnerId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Overview of your TripDAR seals and products
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Products</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">{products.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Assigned Sheets</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">{sheets.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500">Bound Seals</h3>
          <p className="mt-2 text-3xl font-bold text-gray-900">{stats.totalBindings}</p>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-500">Activity feed coming soon</p>
        </div>
      </div>
    </div>
  );
}

