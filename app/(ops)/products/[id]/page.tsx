import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ArchiveButton } from "./ArchiveButton";
import PrintLabelButton from "@/components/labels/PrintLabelButton";

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

async function updateProduct(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const sku = formData.get("sku") as string;
  const unitOfMeasure = formData.get("unitOfMeasure") as string;
  const reorderPoint = parseInt(formData.get("reorderPoint") as string, 10) || 0;
  const leadTimeDays = parseInt(formData.get("leadTimeDays") as string, 10) || 0;
  const defaultBatchSizeStr = formData.get("defaultBatchSize") as string;
  const defaultBatchSize = defaultBatchSizeStr ? parseInt(defaultBatchSizeStr, 10) : null;
  const wholesalePriceStr = formData.get("wholesalePrice") as string;
  const wholesalePrice = wholesalePriceStr ? parseFloat(wholesalePriceStr) : null;

  await prisma.product.update({
    where: { id },
    data: {
      name,
      sku,
      unitOfMeasure,
      reorderPoint,
      leadTimeDays,
      defaultBatchSize,
      wholesalePrice,
    },
  });

  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}`);
}

async function archiveProduct(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;

  await prisma.product.update({
    where: { id },
    data: { active: false },
  });

  revalidatePath("/products");
  redirect("/products");
}

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  if (session.user.role === "REP") {
    redirect("/");
  }

  const { id } = await params;
  const { edit } = await searchParams;
  const isEditing = edit === "true";

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      bom: {
        where: { active: true },
        include: { material: true },
      },
      inventory: {
        include: { location: true },
      },
      productionOrders: {
        take: 5,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!product) {
    notFound();
  }

  // Calculate inventory totals
  const totalOnHand = product.inventory.reduce(
    (sum, item) => sum + item.quantityOnHand,
    0
  );
  const inventoryByLocation = product.inventory.reduce(
    (acc, item) => {
      const locName = item.location.name;
      acc[locName] = (acc[locName] || 0) + item.quantityOnHand;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              {product.sku}
            </span>
            {!product.active && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                Archived
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Product details and configuration
          </p>
        </div>
        <div className="flex gap-2">
          <PrintLabelButton
            entityType="PRODUCT"
            entityId={id}
            entityCode={product.sku}
          />
          {!isEditing ? (
            <>
              <Link
                href={`/products/${id}?edit=true`}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Edit
              </Link>
              {product.active && (
                <ArchiveButton productId={id} archiveAction={archiveProduct} />
              )}
            </>
          ) : (
            <Link
              href={`/products/${id}`}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </Link>
          )}
          <Link
            href="/products"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            &larr; Back to Products
          </Link>
        </div>
      </div>

      {/* Details Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Product Details</h2>
        {isEditing ? (
          <form action={updateProduct} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  type="text"
                  name="name"
                  id="name"
                  defaultValue={product.name}
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="sku" className="block text-sm font-medium text-gray-700">
                  SKU
                </label>
                <input
                  type="text"
                  name="sku"
                  id="sku"
                  defaultValue={product.sku}
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="unitOfMeasure" className="block text-sm font-medium text-gray-700">
                  Unit of Measure
                </label>
                <select
                  name="unitOfMeasure"
                  id="unitOfMeasure"
                  defaultValue={product.unitOfMeasure}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  {UNIT_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
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
                  defaultValue={product.reorderPoint}
                  min="0"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="leadTimeDays" className="block text-sm font-medium text-gray-700">
                  Lead Time (Days)
                </label>
                <input
                  type="number"
                  name="leadTimeDays"
                  id="leadTimeDays"
                  defaultValue={product.leadTimeDays}
                  min="0"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="defaultBatchSize" className="block text-sm font-medium text-gray-700">
                  Default Batch Size
                </label>
                <input
                  type="number"
                  name="defaultBatchSize"
                  id="defaultBatchSize"
                  defaultValue={product.defaultBatchSize ?? ""}
                  min="1"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
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
                    defaultValue={product.wholesalePrice ?? ""}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="mt-1 block w-full pl-7 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="pt-4">
              <button
                type="submit"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Unit of Measure</dt>
              <dd className="mt-1 text-sm text-gray-900">{product.unitOfMeasure}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Reorder Point</dt>
              <dd className="mt-1 text-sm text-gray-900">{product.reorderPoint}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Lead Time</dt>
              <dd className="mt-1 text-sm text-gray-900">{product.leadTimeDays} days</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Default Batch Size</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {product.defaultBatchSize ?? "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Wholesale Price</dt>
              <dd className="mt-1 text-sm text-gray-900 font-semibold">
                {product.wholesalePrice !== null
                  ? `$${product.wholesalePrice.toFixed(2)}`
                  : "Not set"}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* Inventory Summary Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Inventory Summary</h2>
        <div className="mb-4">
          <span className="text-3xl font-semibold text-gray-900">{totalOnHand}</span>
          <span className="ml-2 text-sm text-gray-500">{product.unitOfMeasure}s on hand</span>
        </div>
        {Object.keys(inventoryByLocation).length > 0 ? (
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">By Location</h3>
            <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Object.entries(inventoryByLocation).map(([location, qty]) => (
                <div key={location}>
                  <dt className="text-sm text-gray-500">{location}</dt>
                  <dd className="text-sm font-medium text-gray-900">{qty}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No inventory records</p>
        )}
      </div>

      {/* BOM Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">Bill of Materials</h2>
          <Link
            href={`/products/${id}/bom`}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Edit BOM
          </Link>
        </div>
        {product.bom.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-2">
                  Material
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-2">
                  SKU
                </th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider pb-2">
                  Qty per Unit
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {product.bom.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 text-sm text-gray-900">{item.material.name}</td>
                  <td className="py-2 text-sm text-gray-500">{item.material.sku}</td>
                  <td className="py-2 text-sm text-gray-900 text-right">
                    {item.quantityPerUnit} {item.material.unitOfMeasure}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No BOM items configured</p>
        )}
      </div>

      {/* Recent Production Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Production Orders</h2>
        {product.productionOrders.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-2">
                  Order #
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-2">
                  Quantity
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-2">
                  Status
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-2">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {product.productionOrders.map((order) => (
                <tr key={order.id}>
                  <td className="py-2 text-sm text-blue-600 hover:text-blue-900">
                    <Link href={`/production/${order.id}`}>{order.orderNumber}</Link>
                  </td>
                  <td className="py-2 text-sm text-gray-900">{order.quantityToMake}</td>
                  <td className="py-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        order.status === "COMPLETED"
                          ? "bg-green-100 text-green-800"
                          : order.status === "IN_PROGRESS"
                          ? "bg-blue-100 text-blue-800"
                          : order.status === "CANCELLED"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td className="py-2 text-sm text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No production orders yet</p>
        )}
      </div>
    </div>
  );
}

