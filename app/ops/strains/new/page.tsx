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

  const name = (formData.get('name') as string) || '';
  const shortCode = (formData.get('shortCode') as string) || '';
  const aliasesStr = (formData.get('aliases') as string) || '';
  const aliases = aliasesStr
    ? aliasesStr.split(',').map((a) => a.trim()).filter((a) => a.length > 0)
    : [];

  // Check for duplicates
  const normalizedName = name.trim();
  const normalizedShortCode = shortCode.toUpperCase().trim();

  const existing = await prisma.strain.findFirst({
    where: {
      OR: [{ name: normalizedName }, { shortCode: normalizedShortCode }],
    },
  });

  if (existing) {
    if (existing.name === normalizedName) {
      throw new Error(`A strain with the name "${normalizedName}" already exists.`);
    }
    if (existing.shortCode === normalizedShortCode) {
      throw new Error(`A strain with the short code "${normalizedShortCode}" already exists.`);
    }
  }

  const created = await prisma.strain.create({
    data: {
      name: normalizedName,
      shortCode: normalizedShortCode,
      aliases: JSON.stringify(aliases),
      active: true,
    },
  });

  revalidatePath('/ops/strains');
  redirect(`/ops/strains/${created.id}`);
}

export default async function NewStrainPage({
  searchParams,
}: {
  searchParams?: Promise<{ prefill?: string; aiToast?: string }>;
}) {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  // Only ADMIN can manage strains
  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  const params = (await searchParams) || {};
  const aiToast = params.aiToast === '1' || params.aiToast === 'true';

  let prefillName: string | undefined;
  let prefillShortCode: string | undefined;
  let shortCodeSuggestionUnsafe = false;
  if (params.prefill) {
    try {
      const parsed = JSON.parse(params.prefill) as unknown;
      if (parsed && typeof parsed === 'object' && 'name' in (parsed as Record<string, unknown>)) {
        const n = (parsed as Record<string, unknown>)['name'];
        if (typeof n === 'string' && n.trim().length > 0) {
          prefillName = n.trim();
          prefillShortCode = suggestStrainShortCode(prefillName);

          // Short-code safety: only prefill if it's not already in use.
          if (prefillShortCode) {
            const conflict = await prisma.strain.findUnique({
              where: { shortCode: prefillShortCode.toUpperCase() },
              select: { id: true },
            });
            if (conflict) {
              prefillShortCode = undefined;
              shortCodeSuggestionUnsafe = true;
            }
          }
        }
      }
    } catch {
      // ignore malformed prefill
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Strain</h1>
          <p className="mt-1 text-sm text-gray-600">Add a new strain to the lookup table</p>
        </div>
        <Link href="/ops/strains" className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
          &larr; Back to Strains
        </Link>
      </div>

      {/* Form Card */}
      <div className="bg-white shadow rounded-lg p-6">
        {(aiToast || prefillName) && (
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            AI prepared this form — review before saving.
          </div>
        )}

        <form action={createStrain} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                id="name"
                required
                placeholder="e.g., Penis Envy"
                defaultValue={prefillName || undefined}
                autoFocus={Boolean(prefillName)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
              {prefillName && (
                <p className="mt-1 text-xs text-gray-500">Suggested by AI — review and edit before saving</p>
              )}
            </div>

            <div>
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
                defaultValue={prefillShortCode || undefined}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm uppercase"
              />
              {prefillShortCode && (
                <p className="mt-1 text-xs text-gray-500">Suggested by AI — review and edit before saving</p>
              )}
              {!prefillShortCode && shortCodeSuggestionUnsafe && (
                <p className="mt-1 text-xs text-amber-700">
                  AI couldn’t safely suggest a short code — please choose one.
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
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
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Link
              href="/ops/strains"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Create Strain
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function suggestStrainShortCode(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return '';

  const words = cleaned
    .split(/[\s\-_/]+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ''))
    .filter((w) => w.length > 0);

  if (words.length >= 2) {
    const code = words.slice(0, 3).map((w) => w[0]).join('');
    return code.toUpperCase();
  }

  const single = words[0] || cleaned.replace(/[^A-Za-z0-9]/g, '');
  return single.slice(0, 3).toUpperCase();
}

