/**
 * TripDAR Seals Management Page
 * 
 * Allows ADMIN and WAREHOUSE users to generate seal SVGs and PDFs.
 * 
 * INVARIANTS:
 * - Generator never modifies token state
 * - Same token + version = identical seal forever
 * - All generation events are logged
 */

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { UserRole } from '@prisma/client';
import { SealsClient } from './SealsClient';

export default async function SealsPage() {
  const session = await auth();
  if (!session || !session.user) redirect('/login');
  
  // Only ADMIN and WAREHOUSE can access seal generation
  const allowedRoles: UserRole[] = [UserRole.ADMIN, UserRole.WAREHOUSE];
  if (!allowedRoles.includes(session.user.role as UserRole)) {
    redirect('/ops');
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">TripDAR Seals</h1>
          <p className="mt-1 text-sm text-gray-600">
            Generate TripDAR certification seals for products
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">About TripDAR Seals</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>TripDAR seals indicate product participation in anonymous experience data collection. Each seal contains a unique QR code that links to the product&apos;s certification page.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Seal Generator Client */}
      <SealsClient />
    </div>
  );
}

