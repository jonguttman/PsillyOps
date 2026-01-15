import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

const UNIT_OPTIONS = [
  "jar",
  "bottle",
  "pouch",
  "bag",
  "box",
  "case",
  "unit",
  "each",
  "pack",
];

async function createProduct(formData: FormData) {
  "use server";

  const name = formData.get("name") as string;
  const sku = formData.get("sku") as string;
  const unitOfMeasure = formData.get("unitOfMeasure") as string;
  const reorderPoint = parseInt(formData.get("reorderPoint") as string, 10) || 0;
  const leadTimeDays = parseInt(formData.get("leadTimeDays") as string, 10) || 0;
  const defaultBatchSizeStr = formData.get("defaultBatchSize") as string;
  const defaultBatchSize = defaultBatchSizeStr ? parseInt(defaultBatchSizeStr, 10) : null;
  const wholesalePriceStr = formData.get("wholesalePrice") as string;
  const wholesalePrice = wholesalePriceStr ? parseFloat(wholesalePriceStr) : null;
  const strainIdValue = formData.get("strainId") as string;
  const strainId = strainIdValue && strainIdValue !== '' ? strainIdValue : null;

  await prisma.product.create({
    data: {
      name,
      sku,
      unitOfMeasure,
      reorderPoint,
      leadTimeDays,
      defaultBatchSize,
      wholesalePrice,
      strainId,
      active: true,
    },
  });

  revalidatePath("/ops/products");
  redirect("/ops/products");
}

export default async function NewProductPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  if (session.user.role === "REP") {
    redirect("/");
  }

  // Fetch all active strains for the dropdown
  const strains = await prisma.strain.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, shortCode: true }
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Product</h1>
          <p className="mt-1 text-sm text-gray-600">
            Add a new product to the catalog
          </p>
        </div>
        <Link
          href="/ops/products"
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          &larr; Back to Products
        </Link>
      </div>

      {/* Form Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <form action={createProduct} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                id="name"
                required
                placeholder="e.g., Lions Mane Tincture"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>

            <div>
              <label htmlFor="sku" className="block text-sm font-medium text-gray-700">
                SKU <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="sku"
                id="sku"
                required
                placeholder="e.g., LM-TINCT-30"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">Must be unique</p>
            </div>

            <div>
              <label htmlFor="unitOfMeasure" className="block text-sm font-medium text-gray-700">
                Unit of Measure <span className="text-red-500">*</span>
              </label>
              <select
                name="unitOfMeasure"
                id="unitOfMeasure"
                required
                defaultValue="unit"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                {UNIT_OPTIONS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit.charAt(0).toUpperCase() + unit.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="reorderPoint" className="block text-sm font-medium text-gray-700">
                Reorder Point
              </label>
              <input
                type="number"
                name="reorderPoint"
                id="reorderPoint"
                defaultValue={0}
                min="0"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Alert when inventory falls below this level
              </p>
            </div>

            <div>
              <label htmlFor="leadTimeDays" className="block text-sm font-medium text-gray-700">
                Lead Time (Days)
              </label>
              <input
                type="number"
                name="leadTimeDays"
                id="leadTimeDays"
                defaultValue={0}
                min="0"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Days required to produce or restock
              </p>
            </div>

            <div>
              <label htmlFor="defaultBatchSize" className="block text-sm font-medium text-gray-700">
                Default Batch Size
              </label>
              <input
                type="number"
                name="defaultBatchSize"
                id="defaultBatchSize"
                min="1"
                placeholder="Optional"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Standard production quantity per batch
              </p>
            </div>

            <div>
              <label htmlFor="wholesalePrice" className="block text-sm font-medium text-gray-700">
                Wholesale Price ($)
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-500 sm:text-sm">$</span>
                </div>
                <input
                  type="number"
                  name="wholesalePrice"
                  id="wholesalePrice"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="block w-full pl-7 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Default price per unit for wholesale orders
              </p>
            </div>

            <div>
              <label htmlFor="strainId" className="block text-sm font-medium text-gray-700">
                Strain
              </label>
              <select
                name="strainId"
                id="strainId"
                defaultValue=""
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="">No strain selected</option>
                {strains.map((strain) => (
                  <option key={strain.id} value={strain.id}>
                    {strain.name} ({strain.shortCode})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Optional: Associate this product with a specific strain
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Link
              href="/ops/products"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Create Product
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

