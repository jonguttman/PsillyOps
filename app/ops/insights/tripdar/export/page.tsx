// TripDAR Export Page
// Export experience reviews for ML analysis

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { hasPermission } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';
import { ExportClient } from './ExportClient';

export default async function ExportPage() {
  const session = await auth();
  
  if (!session || !session.user) {
    redirect('/login');
  }
  
  if (!hasPermission(session.user.role as UserRole, 'insights', 'export')) {
    redirect('/ops/dashboard');
  }
  
  return <ExportClient />;
}

