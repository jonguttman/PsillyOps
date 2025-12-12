import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

// Category display labels
const CATEGORY_LABELS: Record<string, string> = {
  RAW_BOTANICAL: "Raw Botanical",
  ACTIVE_INGREDIENT: "Active Ingredient",
  EXCIPIENT: "Excipient",
  FLAVORING: "Flavoring",
  PACKAGING: "Packaging",
  LABEL: "Label",
  SHIPPING: "Shipping",
  OTHER: "Other"
};

// Category colors for badges
const CATEGORY_COLORS: Record<string, string> = {
  RAW_BOTANICAL: "bg-green-100 text-green-800",
  ACTIVE_INGREDIENT: "bg-purple-100 text-purple-800",
  EXCIPIENT: "bg-blue-100 text-blue-800",
  FLAVORING: "bg-orange-100 text-orange-800",
  PACKAGING: "bg-gray-100 text-gray-800",
  LABEL: "bg-yellow-100 text-yellow-800",
  SHIPPING: "bg-indigo-100 text-indigo-800",
  OTHER: "bg-slate-100 text-slate-800"
};

export default async function MaterialsPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  if (session.user.role === "REP") {
    redirect("/");
  }

  const materials = await prisma.rawMaterial.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      preferredVendor: {
        select: { id: true, name: true }
      },
      vendors: {
        where: { preferred: true },
        select: { lastPrice: true }
      },
      _count: {
        select: {
          inventory: true,
          bomUsage: true
        }
      }
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Materials</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage raw materials and components
          </p>
        </div>
        <Link
          href="/materials/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          New Material
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Material
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SKU
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Preferred Vendor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cost
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Lead Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reorder Point
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {materials.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                  No materials found.{" "}
                  <Link href="/materials/new" className="text-blue-600 hover:text-blue-900">
                    Create your first material
                  </Link>
                </td>
              </tr>
            ) : (
              materials.map((material) => (
                <tr key={material.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {material.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {material.unitOfMeasure}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        CATEGORY_COLORS[material.category] || CATEGORY_COLORS.OTHER
                      }`}
                    >
                      {CATEGORY_LABELS[material.category] || material.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{material.sku}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {material.preferredVendor?.name || (
                        <span className="text-gray-400">Not set</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {material.vendors[0]?.lastPrice ? (
                        `$${material.vendors[0].lastPrice.toFixed(2)}`
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {material.leadTimeDays > 0 ? (
                        `${material.leadTimeDays} days`
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {material.reorderPoint > 0 ? (
                        material.reorderPoint.toLocaleString()
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/materials/${material.id}`}
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

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm text-gray-500">Total Materials</div>
          <div className="text-2xl font-semibold text-gray-900">{materials.length}</div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm text-gray-500">With Preferred Vendor</div>
          <div className="text-2xl font-semibold text-gray-900">
            {materials.filter(m => m.preferredVendor).length}
          </div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm text-gray-500">Used in BOMs</div>
          <div className="text-2xl font-semibold text-gray-900">
            {materials.filter(m => m._count.bomUsage > 0).length}
          </div>
        </div>
      </div>
    </div>
  );
}
