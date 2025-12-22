// TripDAR Dashboard
// Main insights dashboard for experience data collection

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { hasPermission } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';
import { getReviewStats } from '@/lib/services/experienceService';
import { TripDARDashboardClient } from './TripDARDashboardClient';

export default async function TripDARDashboardPage() {
  const session = await auth();
  
  if (!session || !session.user) {
    redirect('/login');
  }
  
  if (!hasPermission(session.user.role as UserRole, 'insights', 'view')) {
    redirect('/ops/dashboard');
  }
  
  // Fetch stats
  const stats = await getReviewStats();
  
  return <TripDARDashboardClient initialStats={stats} />;
}

