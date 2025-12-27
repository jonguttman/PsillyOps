// Locations Settings Page
// Admin-only page for managing storage locations

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import LocationsSettingsClient from './LocationsSettingsClient';
import { getLocationPath } from '@/lib/services/locationService';

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
      parent: {
        select: { id: true, name: true, type: true },
      },
      children: {
        where: { active: true },
        select: { id: true, name: true, type: true },
      },
      _count: {
        select: { inventory: true },
      },
    },
  });

  // Build paths for each location
  const transformedLocations = await Promise.all(
    locations.map(async (loc) => ({
      id: loc.id,
      name: loc.name,
      type: loc.type,
      parentId: loc.parentId,
      parent: loc.parent,
      children: loc.children,
      path: await getLocationPath(loc.id),
      isDefaultReceiving: loc.isDefaultReceiving,
      isDefaultShipping: loc.isDefaultShipping,
      active: loc.active,
      createdAt: loc.createdAt.toISOString(),
      inventoryCount: loc._count.inventory,
    }))
  );

  return <LocationsSettingsClient locations={transformedLocations} />;
}
