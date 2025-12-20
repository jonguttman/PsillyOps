import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getStrain } from '@/lib/services/strainService';

export default async function StrainDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  // Only ADMIN can manage strains
  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  const { id } = await params;
  const strain = await getStrain(id);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{strain.name}</h1>
          <p className="mt-1 text-sm text-gray-600">
            Short code: <span className="font-semibold">{strain.shortCode}</span>
          </p>
        </div>
        <Link href="/ops/strains" className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
          &larr; Back to Strains
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              strain.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {strain.active ? 'Active' : 'Archived'}
          </span>
          {Array.isArray(strain.aliases) && strain.aliases.length > 0 && (
            <span className="text-sm text-gray-600">Aliases: {strain.aliases.join(', ')}</span>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Products using this strain</h2>
          {strain.products.length === 0 ? (
            <div className="text-sm text-gray-500">No active products reference this strain.</div>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-200 rounded-md">
              {strain.products.map((p) => (
                <li key={p.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.sku}</div>
                  </div>
                  <Link href={`/ops/products/${p.id}`} className="text-sm text-blue-600 hover:text-blue-800">
                    View
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

