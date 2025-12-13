import { auth } from '@/lib/auth/auth';
import { prisma } from '@/lib/db/prisma';

export default async function OpsHomePage() {
  const session = await auth();

  // Get dashboard stats
  const [
    productsCount,
    materialsCount,
    ordersCount,
    productionOrdersCount,
    recentActivity
  ] = await Promise.all([
    prisma.product.count({ where: { active: true } }),
    prisma.rawMaterial.count({ where: { active: true } }),
    prisma.retailerOrder.count({ where: { status: { in: ['SUBMITTED', 'APPROVED', 'IN_FULFILLMENT'] } } }),
    prisma.productionOrder.count({ where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } } }),
    prisma.activityLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { user: true }
    })
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Welcome back, {session?.user.name}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500 truncate">
                  Active Products
                </p>
                <p className="mt-1 text-3xl font-semibold text-gray-900">
                  {productsCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500 truncate">
                  Raw Materials
                </p>
                <p className="mt-1 text-3xl font-semibold text-gray-900">
                  {materialsCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500 truncate">
                  Open Orders
                </p>
                <p className="mt-1 text-3xl font-semibold text-gray-900">
                  {ordersCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-500 truncate">
                  Production Orders
                </p>
                <p className="mt-1 text-3xl font-semibold text-gray-900">
                  {productionOrdersCount}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900">
            Recent Activity
          </h3>
          <div className="mt-5">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-gray-500">No recent activity</p>
            ) : (
              <div className="flow-root">
                <ul className="-mb-8">
                  {recentActivity.map((log, idx) => (
                    <li key={log.id}>
                      <div className="relative pb-8">
                        {idx !== recentActivity.length - 1 && (
                          <span
                            className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                            aria-hidden="true"
                          />
                        )}
                        <div className="relative flex space-x-3">
                          <div>
                            <span className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center ring-8 ring-white">
                              <span className="text-white text-xs">
                                {log.user?.name?.[0] || 'S'}
                              </span>
                            </span>
                          </div>
                          <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                            <div>
                              <p className="text-sm text-gray-900">{log.summary}</p>
                              <p className="mt-0.5 text-xs text-gray-500">
                                {Array.isArray(log.tags) ? log.tags.join(', ') : ''}
                              </p>
                            </div>
                            <div className="whitespace-nowrap text-right text-xs text-gray-500">
                              {new Date(log.createdAt).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


