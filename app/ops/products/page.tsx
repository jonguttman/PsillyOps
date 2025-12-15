import { prisma } from '@/lib/db/prisma';
import Link from 'next/link';

export default async function ProductsPage({
  searchParams
}: {
  searchParams: Promise<{ strain?: string }>
}) {
  const params = await searchParams;
  const strainFilter = params.strain;

  // Build where clause
  const where: any = { active: true };
  if (strainFilter) {
    where.strainId = strainFilter;
  }

  // Fetch products with strain info
  const products = await prisma.product.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      strain: {
        select: { id: true, name: true, shortCode: true }
      },
      _count: {
        select: {
          inventory: true,
          bom: {
            where: { active: true }
          }
        }
      }
    }
  });

  // Fetch all strains for the filter dropdown
  const strains = await prisma.strain.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, shortCode: true }
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage finished product catalog
          </p>
        </div>
        <Link
          href="/products/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          New Product
        </Link>
      </div>

      {/* Strain Filter */}
      {strains.length > 0 && (
        <div className="flex items-center gap-3">
          <label htmlFor="strainFilter" className="text-sm font-medium text-gray-700">
            Filter by Strain:
          </label>
          <form className="flex items-center gap-2">
            <select
              id="strainFilter"
              name="strain"
              defaultValue={strainFilter || ''}
              className="block w-48 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">All Strains</option>
              {strains.map((strain) => (
                <option key={strain.id} value={strain.id}>
                  {strain.name} ({strain.shortCode})
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Apply
            </button>
            {strainFilter && (
              <Link
                href="/products"
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear
              </Link>
            )}
          </form>
        </div>
      )}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SKU
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Strain
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Unit
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reorder Point
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                BOM Items
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {products.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  {strainFilter 
                    ? 'No products found with this strain filter.'
                    : 'No products found. Create your first product to get started.'}
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {product.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{product.sku}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {product.strain ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {product.strain.shortCode}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{product.unitOfMeasure}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{product.reorderPoint}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{product._count.bom}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/products/${product.id}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
