// TripDAR Review Browser
// Browse and filter experience reviews

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { hasPermission } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';
import { ReviewsBrowserClient } from './ReviewsBrowserClient';

export default async function ReviewsBrowserPage() {
  const session = await auth();
  
  if (!session || !session.user) {
    redirect('/login');
  }
  
  if (!hasPermission(session.user.role as UserRole, 'insights', 'view')) {
    redirect('/ops/dashboard');
  }
  
  return <ReviewsBrowserClient />;
}

