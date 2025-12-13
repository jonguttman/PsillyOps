import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';

async function createStrain(formData: FormData) {
  'use server';
  
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }
  
  const name = formData.get('name') as string;
  const shortCode = formData.get('shortCode') as string;
  const aliasesStr = formData.get('aliases') as string;
  const aliases = aliasesStr 
    ? aliasesStr.split(',').map(a => a.trim()).filter(a => a.length > 0)
    : [];

  // Check for duplicates
  const normalizedName = name.trim();
  const normalizedShortCode = shortCode.toUpperCase().trim();
  
  const existing = await prisma.strain.findFirst({
    where: {
      OR: [
        { name: normalizedName },
        { shortCode: normalizedShortCode }
      ]
    }
  });

  if (existing) {
    if (existing.name === normalizedName) {
      throw new Error(`A strain with the name "${normalizedName}" already exists.`);
    }
    if (existing.shortCode === normalizedShortCode) {
      throw new Error(`A strain with the short code "${normalizedShortCode}" already exists.`);
    }
  }

  await prisma.strain.create({
    data: {
      name: normalizedName,
      shortCode: normalizedShortCode,
      aliases: JSON.stringify(aliases),
      active: true
    }
  });

  revalidatePath('/strains');
}

async function archiveStrain(formData: FormData) {
  'use server';
  
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }
  
  const id = formData.get('id') as string;
  
  await prisma.strain.update({
    where: { id },
    data: { active: false }
  });

  revalidatePath('/strains');
}

async function restoreStrain(formData: FormData) {
  'use server';
  
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }
  
  const id = formData.get('id') as string;
  
  await prisma.strain.update({
    where: { id },
    data: { active: true }
  });

  revalidatePath('/strains');
}

export default async function StrainsPage({
  searchParams
}: {
  searchParams: Promise<{ showArchived?: string }>
}) {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  // Only ADMIN can manage strains
  if (session.user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const showArchived = params.showArchived === 'true';

  const strains = await prisma.strain.findMany({
    where: showArchived ? {} : { active: true },
    include: {
      _count: {
        select: { 
          products: { where: { active: true } } 
        }
      }
    },
    orderBy: { name: 'asc' }
  });

  // Parse aliases for display
  const strainsWithAliases = strains.map(strain => {
    let aliases: string[] = [];
    try {
      if (strain.aliases) {
        const parsed = typeof strain.aliases === 'string' 
          ? JSON.parse(strain.aliases) 
          : strain.aliases;
        aliases = Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      aliases = [];
    }
    return { ...strain, parsedAliases: aliases };
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Strains</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage strain lookup table for products
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={showArchived ? '/strains' : '/strains?showArchived=true'}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </Link>
        </div>
      </div>

      {/* Create Form */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Add New Strain</h2>
        <form action={createStrain} className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              id="name"
              required
              placeholder="e.g., Penis Envy"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <div className="w-32">
            <label htmlFor="shortCode" className="block text-sm font-medium text-gray-700">
              Short Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="shortCode"
              id="shortCode"
              required
              placeholder="e.g., PE"
              maxLength={10}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm uppercase"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="aliases" className="block text-sm font-medium text-gray-700">
              Aliases (comma-separated)
            </label>
            <input
              type="text"
              name="aliases"
              id="aliases"
              placeholder="e.g., P. Envy, PenisEnvy"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            Add Strain
          </button>
        </form>
      </div>

      {/* Strains Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Strain
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Short Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Aliases
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Products
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {strainsWithAliases.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No strains found. Add your first strain above.
                </td>
              </tr>
            ) : (
              strainsWithAliases.map((strain) => (
                <tr key={strain.id} className={`hover:bg-gray-50 ${!strain.active ? 'opacity-50' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{strain.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      {strain.shortCode}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {strain.parsedAliases.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {strain.parsedAliases.map((alias, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"
                          >
                            {alias}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{strain._count.products}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {strain.active ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        Archived
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {strain.active ? (
                      <form action={archiveStrain} className="inline">
                        <input type="hidden" name="id" value={strain.id} />
                        <button
                          type="submit"
                          className="text-red-600 hover:text-red-900"
                          disabled={strain._count.products > 0}
                          title={strain._count.products > 0 ? 'Cannot archive strain with active products' : 'Archive strain'}
                        >
                          {strain._count.products > 0 ? (
                            <span className="text-gray-400 cursor-not-allowed">Archive</span>
                          ) : (
                            'Archive'
                          )}
                        </button>
                      </form>
                    ) : (
                      <form action={restoreStrain} className="inline">
                        <input type="hidden" name="id" value={strain.id} />
                        <button
                          type="submit"
                          className="text-green-600 hover:text-green-900"
                        >
                          Restore
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800">About Strains</h3>
        <div className="mt-2 text-sm text-blue-700">
          <p>Strains are used to categorize products by their active ingredient source. Examples include:</p>
          <ul className="mt-2 list-disc list-inside space-y-1">
            <li><strong>PE</strong> - Penis Envy</li>
            <li><strong>GT</strong> - Golden Teacher</li>
            <li><strong>LM</strong> - Lions Mane</li>
            <li><strong>CORD</strong> - Cordyceps</li>
          </ul>
          <p className="mt-2">
            The short code is used by the AI command system to resolve product references like &quot;Mighty Caps PE&quot;.
          </p>
        </div>
      </div>
    </div>
  );
}

