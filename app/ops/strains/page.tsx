import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import StrainsHashRedirectClient from './StrainsHashRedirectClient';

type StrainRow = {
  id: string;
  name: string;
  shortCode: string;
  aliases: unknown;
  active: boolean;
  _count?: { products: number };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isStrainRow(v: unknown): v is StrainRow {
  if (!isRecord(v)) return false;
  return typeof v.id === 'string' && typeof v.name === 'string' && typeof v.shortCode === 'string' && typeof v.active === 'boolean';
}

async function archiveStrain(formData: FormData) {
  'use server';
  
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }
  
  const id = formData.get('id') as string;
  
  // NOTE: Prisma Client typings can be stale in some dev environments.
  // Keep runtime correct while avoiding explicit `any`.
  const prismaWithStrain = prisma as unknown as { strain: { update: (args: unknown) => Promise<unknown> } };
  await prismaWithStrain.strain.update({
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
  
  const prismaWithStrain = prisma as unknown as { strain: { update: (args: unknown) => Promise<unknown> } };
  await prismaWithStrain.strain.update({
    where: { id },
    data: { active: true }
  });

  revalidatePath('/strains');
}

export default async function StrainsPage({
  searchParams
}: {
  searchParams: Promise<{ showArchived?: string; prefill?: string; aiToast?: string }>
}) {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  // Only ADMIN can manage strains
  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  const params = await searchParams;
  const showArchived = params.showArchived === 'true';
  const aiToast = params.aiToast === '1' || params.aiToast === 'true';

  // If AI tried to prefill on the old route, redirect to the canonical `/strains/new`.
  if (params.prefill || aiToast) {
    const qs = new URLSearchParams();
    if (params.prefill) qs.set('prefill', params.prefill);
    if (params.aiToast) qs.set('aiToast', params.aiToast);
    redirect(`/strains/new?${qs.toString()}`);
  }

  const prismaWithStrain = prisma as unknown as { strain: { findMany: (args: unknown) => Promise<unknown[]> } };
  const strains = await prismaWithStrain.strain.findMany({
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
  const strainsWithAliases = strains.filter(isStrainRow).map((strain) => {
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
      <StrainsHashRedirectClient />
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Strains</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage strain lookup table for products
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/ops/strains/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            New Strain
          </Link>
          <Link
            href={showArchived ? '/strains' : '/strains?showArchived=true'}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </Link>
        </div>
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
                    <Link href={`/strains/${strain.id}`} className="text-sm font-medium text-blue-700 hover:text-blue-900">
                      {strain.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      {strain.shortCode}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {strain.parsedAliases.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {strain.parsedAliases.map((alias: string, i: number) => (
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
                    <div className="text-sm text-gray-900">{strain._count?.products ?? 0}</div>
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
                          disabled={(strain._count?.products ?? 0) > 0}
                          title={(strain._count?.products ?? 0) > 0 ? 'Cannot archive strain with active products' : 'Archive strain'}
                        >
                          {(strain._count?.products ?? 0) > 0 ? (
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

