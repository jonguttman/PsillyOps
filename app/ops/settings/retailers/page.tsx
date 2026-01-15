// Retailers Settings Page
// Admin-only page for managing retailers

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import RetailersSettingsClient from './RetailersSettingsClient';

export default async function RetailersSettingsPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  // Only ADMIN can manage retailers
  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  // Fetch retailers with related data
  const retailers = await prisma.retailer.findMany({
    include: {
      salesRep: {
        select: {
          id: true,
          name: true,
          email: true,
        }
      },
      _count: {
        select: {
          orders: true,
          invoices: true,
        }
      }
    },
    orderBy: { name: 'asc' }
  });

  // Fetch users who can be sales reps (ADMIN and REP roles)
  const salesReps = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'REP'] },
      active: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
    orderBy: { name: 'asc' }
  });

  const formattedRetailers = retailers.map(r => ({
    id: r.id,
    name: r.name,
    contactEmail: r.contactEmail,
    contactPhone: r.contactPhone,
    shippingAddress: r.shippingAddress,
    billingAddress: r.billingAddress,
    notes: r.notes,
    salesRepId: r.salesRepId,
    salesRep: r.salesRep,
    active: r.active,
    ordersCount: r._count.orders,
    invoicesCount: r._count.invoices,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <RetailersSettingsClient 
      retailers={formattedRetailers}
      salesReps={salesReps}
    />
  );
}

