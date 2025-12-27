// Locations Settings Page
// Admin-only page for managing storage locations

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import LocationsSettingsClient from './LocationsSettingsClient';

export default async function LocationsSettingsPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  // Only ADMIN can manage locations
  if (session.user.role !== 'ADMIN') {
    redirect('/ops/settings');
  }

  // Fetch all locations (including inactive for management)
  const locations = await prisma.location.findMany({
    orderBy: [{ active: 'desc' }, { type: 'asc' }, { name: 'asc' }],
    include: {
      _count: {
        select: { inventory: true },
      },
    },
  });

  const transformedLocations = locations.map((loc) => ({
    id: loc.id,
    name: loc.name,
    type: loc.type,
    isDefaultReceiving: loc.isDefaultReceiving,
    isDefaultShipping: loc.isDefaultShipping,
    active: loc.active,
    createdAt: loc.createdAt.toISOString(),
    inventoryCount: loc._count.inventory,
  }));

  return <LocationsSettingsClient locations={transformedLocations} />;
}

