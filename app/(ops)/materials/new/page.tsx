import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

const UNIT_OPTIONS = [
  "kg",
  "g",
  "mg",
  "L",
  "mL",
  "oz",
  "lb",
  "pcs",
  "units",
  "sheets",
  "rolls",
  "boxes",
  "each"
];

const CATEGORY_OPTIONS = [
  { value: "RAW_BOTANICAL", label: "Raw Botanical" },
  { value: "ACTIVE_INGREDIENT", label: "Active Ingredient" },
  { value: "EXCIPIENT", label: "Excipient" },
  { value: "FLAVORING", label: "Flavoring" },
  { value: "PACKAGING", label: "Packaging" },
  { value: "LABEL", label: "Label" },
  { value: "SHIPPING", label: "Shipping" },
  { value: "OTHER", label: "Other" }
];

async function createMaterial(formData: FormData) {
  "use server";

  const name = formData.get("name") as string;
  const sku = formData.get("sku") as string;
  const unitOfMeasure = formData.get("unitOfMeasure") as string;
  const category = formData.get("category") as string;
  const description = formData.get("description") as string;
  const reorderPoint = parseFloat(formData.get("reorderPoint") as string) || 0;
  const reorderQuantity = parseFloat(formData.get("reorderQuantity") as string) || 0;
  const moq = parseFloat(formData.get("moq") as string) || 0;
  const leadTimeDays = parseInt(formData.get("leadTimeDays") as string, 10) || 0;

  await prisma.rawMaterial.create({
    data: {
      name,
      sku,
      unitOfMeasure,
      category: category as "RAW_BOTANICAL" | "ACTIVE_INGREDIENT" | "EXCIPIENT" | "FLAVORING" | "PACKAGING" | "LABEL" | "SHIPPING" | "OTHER",
      description: description || null,
      reorderPoint,
      reorderQuantity,
      moq,
      leadTimeDays,
      active: true
    }
  });

  revalidatePath("/materials");
  redirect("/materials");
}

export default async function NewMaterialPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  if (session.user.role === "REP") {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Material</h1>
          <p className="mt-1 text-sm text-gray-600">
            Add a new raw material or component
          </p>
        </div>
        <Link
          href="/materials"
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          &larr; Back to Materials
        </Link>
      </div>

      {/* Form Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <form action={createMaterial} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Material Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                id="name"
                required
                placeholder="e.g., Lions Mane Extract Powder"
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
                placeholder="e.g., LM-EXT-001"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">Must be unique</p>
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                name="category"
                id="category"
                required
                defaultValue="OTHER"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="unitOfMeasure" className="block text-sm font-medium text-gray-700">
                Unit of Measure <span className="text-red-500">*</span>
              </label>
              <select
                name="unitOfMeasure"
                id="unitOfMeasure"
                required
                defaultValue="kg"
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
                defaultValue={0}
                min="0"
                step="0.01"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Alert when stock falls below this level
              </p>
            </div>

            <div>
              <label htmlFor="reorderQuantity" className="block text-sm font-medium text-gray-700">
                Reorder Quantity
              </label>
              <input
                type="number"
                name="reorderQuantity"
                id="reorderQuantity"
                defaultValue={0}
                min="0"
                step="0.01"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Suggested quantity to order when replenishing
              </p>
            </div>

            <div>
              <label htmlFor="moq" className="block text-sm font-medium text-gray-700">
                Minimum Order Quantity (MOQ)
              </label>
              <input
                type="number"
                name="moq"
                id="moq"
                defaultValue={0}
                min="0"
                step="0.01"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Minimum quantity that can be ordered
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
                Default lead time for procurement
              </p>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                name="description"
                id="description"
                rows={3}
                placeholder="Optional description, specifications, or notes about this material..."
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Link
              href="/materials"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Create Material
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
