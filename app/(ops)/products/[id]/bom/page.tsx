import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { BOMItemRow } from "./BOMItemRow";

async function addBOMItem(formData: FormData) {
  "use server";

  const productId = formData.get("productId") as string;
  const materialId = formData.get("materialId") as string;
  const quantityPerUnit = parseFloat(formData.get("quantityPerUnit") as string);

  if (!materialId || !quantityPerUnit) {
    return;
  }

  // Check if this material is already in the BOM
  const existing = await prisma.bOMItem.findFirst({
    where: {
      productId,
      materialId,
      active: true,
    },
  });

  if (existing) {
    // Update the existing item
    await prisma.bOMItem.update({
      where: { id: existing.id },
      data: { quantityPerUnit },
    });
  } else {
    // Create new BOM item
    await prisma.bOMItem.create({
      data: {
        productId,
        materialId,
        quantityPerUnit,
        active: true,
      },
    });
  }

  revalidatePath(`/products/${productId}/bom`);
}

async function updateBOMItem(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;
  const productId = formData.get("productId") as string;
  const quantityPerUnit = parseFloat(formData.get("quantityPerUnit") as string);

  await prisma.bOMItem.update({
    where: { id },
    data: { quantityPerUnit },
  });

  revalidatePath(`/products/${productId}/bom`);
}

async function removeBOMItem(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;
  const productId = formData.get("productId") as string;

  await prisma.bOMItem.update({
    where: { id },
    data: { active: false },
  });

  revalidatePath(`/products/${productId}/bom`);
}

export default async function BOMEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  if (session.user.role === "REP") {
    redirect("/");
  }

  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      bom: {
        where: { active: true },
        include: { material: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!product) {
    notFound();
  }

  // Get all active materials for the dropdown
  const materials = await prisma.rawMaterial.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });

  // Filter out materials already in the BOM
  const existingMaterialIds = new Set(product.bom.map((item) => item.materialId));
  const availableMaterials = materials.filter(
    (m) => !existingMaterialIds.has(m.id)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Bill of Materials: {product.name}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Configure the raw materials required to produce this product
          </p>
        </div>
        <Link
          href={`/products/${id}`}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          &larr; Back to Product
        </Link>
      </div>

      {/* Current BOM Items */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Current Materials ({product.bom.length})
        </h2>

        {product.bom.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                  Material
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                  SKU
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                  Unit
                </th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                  Qty per Unit
                </th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {product.bom.map((item) => (
                <BOMItemRow
                  key={item.id}
                  item={item}
                  productId={id}
                  updateAction={updateBOMItem}
                  removeAction={removeBOMItem}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">
            No materials configured. Add materials below.
          </p>
        )}
      </div>

      {/* Add New Material */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Add Material</h2>

        {availableMaterials.length > 0 ? (
          <form action={addBOMItem} className="flex gap-4 items-end">
            <input type="hidden" name="productId" value={id} />

            <div className="flex-1">
              <label
                htmlFor="materialId"
                className="block text-sm font-medium text-gray-700"
              >
                Material
              </label>
              <select
                name="materialId"
                id="materialId"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="">Select a material...</option>
                {availableMaterials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name} ({material.sku}) - {material.unitOfMeasure}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-40">
              <label
                htmlFor="quantityPerUnit"
                className="block text-sm font-medium text-gray-700"
              >
                Qty per Unit
              </label>
              <input
                type="number"
                name="quantityPerUnit"
                id="quantityPerUnit"
                required
                min="0.001"
                step="0.001"
                placeholder="e.g., 1.5"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Add
            </button>
          </form>
        ) : materials.length === 0 ? (
          <div className="text-sm text-gray-500">
            <p>No raw materials exist yet.</p>
            <Link
              href="/materials/new"
              className="text-blue-600 hover:text-blue-900"
            >
              Create your first material &rarr;
            </Link>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            All available materials have been added to this BOM.
          </p>
        )}
      </div>
    </div>
  );
}

