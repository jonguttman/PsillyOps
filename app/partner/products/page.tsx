import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { isPartnerUser } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';
import { listPartnerProducts } from '@/lib/services/partnerProductService';
import Link from 'next/link';

export default async function PartnerProductsPage() {
  const session = await auth();
  
  if (!session?.user || !isPartnerUser(session.user.role as UserRole)) {
    redirect('/partner/login');
  }

  if (!session.user.partnerId) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-800">
          You are not assigned to a partner.
        </p>
      </div>
    );
  }

  const products = await listPartnerProducts(session.user.partnerId);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage your partner products
          </p>
        </div>
        {session.user.role === 'PARTNER_ADMIN' && (
          <Link
            href="/partner/products/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            New Product
          </Link>
        )}
      </div>

      {products.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-sm text-gray-500">No products yet</p>
          {session.user.role === 'PARTNER_ADMIN' && (
            <Link
              href="/partner/products/new"
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-600 hover:text-blue-700"
            >
              Create your first product
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SKU
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bindings
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {product.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {product.sku || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {product._count.bindings}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

