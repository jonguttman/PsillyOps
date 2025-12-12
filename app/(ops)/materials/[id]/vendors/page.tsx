import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { VendorRelationshipRow } from "./VendorRelationshipRow";

async function addVendorRelationship(formData: FormData) {
  "use server";
  const materialId = formData.get("materialId") as string;
  const vendorId = formData.get("vendorId") as string;
  const lastPrice = formData.get("lastPrice") as string;
  const moq = formData.get("moq") as string;
  const leadTimeDays = formData.get("leadTimeDays") as string;
  const notes = formData.get("notes") as string;
  const preferred = formData.get("preferred") === "true";

  // If setting as preferred, unset others first
  if (preferred) {
    await prisma.materialVendor.updateMany({
      where: { materialId },
      data: { preferred: false }
    });
    await prisma.rawMaterial.update({
      where: { id: materialId },
      data: { preferredVendorId: vendorId }
    });
  }

  await prisma.materialVendor.upsert({
    where: {
      materialId_vendorId: { materialId, vendorId }
    },
    create: {
      materialId,
      vendorId,
      lastPrice: lastPrice ? parseFloat(lastPrice) : null,
      moq: moq ? parseFloat(moq) : 0,
      leadTimeDays: leadTimeDays ? parseInt(leadTimeDays, 10) : null,
      notes: notes || null,
      preferred
    },
    update: {
      lastPrice: lastPrice ? parseFloat(lastPrice) : null,
      moq: moq ? parseFloat(moq) : 0,
      leadTimeDays: leadTimeDays ? parseInt(leadTimeDays, 10) : null,
      notes: notes || null,
      preferred
    }
  });

  // Record cost history if price was set
  if (lastPrice) {
    await prisma.materialCostHistory.create({
      data: {
        materialId,
        vendorId,
        price: parseFloat(lastPrice),
        source: "VENDOR_UPDATE"
      }
    });
  }

  revalidatePath(`/materials/${materialId}/vendors`);
}

async function updateVendorRelationship(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const materialId = formData.get("materialId") as string;
  const lastPrice = formData.get("lastPrice") as string;
  const moq = formData.get("moq") as string;
  const leadTimeDays = formData.get("leadTimeDays") as string;
  const notes = formData.get("notes") as string;

  const existing = await prisma.materialVendor.findUnique({ where: { id } });

  await prisma.materialVendor.update({
    where: { id },
    data: {
      lastPrice: lastPrice ? parseFloat(lastPrice) : null,
      moq: moq ? parseFloat(moq) : 0,
      leadTimeDays: leadTimeDays ? parseInt(leadTimeDays, 10) : null,
      notes: notes || null
    }
  });

  // Record cost history if price changed
  if (lastPrice && existing && parseFloat(lastPrice) !== existing.lastPrice) {
    await prisma.materialCostHistory.create({
      data: {
        materialId,
        vendorId: existing.vendorId,
        price: parseFloat(lastPrice),
        source: "VENDOR_UPDATE"
      }
    });
  }

  revalidatePath(`/materials/${materialId}/vendors`);
}

async function removeVendorRelationship(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const materialId = formData.get("materialId") as string;

  const mv = await prisma.materialVendor.findUnique({ where: { id } });

  if (mv?.preferred) {
    await prisma.rawMaterial.update({
      where: { id: materialId },
      data: { preferredVendorId: null }
    });
  }

  await prisma.materialVendor.delete({ where: { id } });

  revalidatePath(`/materials/${materialId}/vendors`);
}

async function setPreferred(formData: FormData) {
  "use server";
  const materialId = formData.get("materialId") as string;
  const vendorId = formData.get("vendorId") as string;

  await prisma.materialVendor.updateMany({
    where: { materialId },
    data: { preferred: false }
  });

  await prisma.materialVendor.updateMany({
    where: { materialId, vendorId },
    data: { preferred: true }
  });

  await prisma.rawMaterial.update({
    where: { id: materialId },
    data: { preferredVendorId: vendorId }
  });

  revalidatePath(`/materials/${materialId}/vendors`);
}

export default async function MaterialVendorsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session || !session.user) redirect("/login");
  if (session.user.role === "REP") redirect("/");

  const { id } = await params;

  const material = await prisma.rawMaterial.findUnique({
    where: { id },
    include: {
      vendors: {
        include: { vendor: true },
        orderBy: { preferred: "desc" }
      }
    }
  });

  if (!material) notFound();

  // Get all active vendors for adding new relationships
  const allVendors = await prisma.vendor.findMany({
    where: { active: true },
    orderBy: { name: "asc" }
  });

  // Filter out vendors already associated
  const existingVendorIds = new Set(material.vendors.map(v => v.vendorId));
  const availableVendors = allVendors.filter(v => !existingVendorIds.has(v.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendor Relationships</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage vendors for: <span className="font-medium">{material.name}</span>
          </p>
        </div>
        <Link
          href={`/materials/${id}`}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          &larr; Back to Material
        </Link>
      </div>

      {/* Current Vendors */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Current Vendors ({material.vendors.length})
        </h2>

        {material.vendors.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-3">Vendor</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-3">Price</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-3">MOQ</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-3">Lead Time</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-3">Notes</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase pb-3">Preferred</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {material.vendors.map((mv) => (
                <VendorRelationshipRow
                  key={mv.id}
                  materialVendor={mv}
                  materialId={id}
                  updateAction={updateVendorRelationship}
                  removeAction={removeVendorRelationship}
                  setPreferredAction={setPreferred}
                />
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No vendors assigned yet.</p>
        )}
      </div>

      {/* Add New Vendor */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Add Vendor</h2>

        {availableVendors.length > 0 ? (
          <form action={addVendorRelationship} className="space-y-4">
            <input type="hidden" name="materialId" value={id} />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label htmlFor="vendorId" className="block text-sm font-medium text-gray-700">
                  Vendor <span className="text-red-500">*</span>
                </label>
                <select
                  name="vendorId"
                  id="vendorId"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="">Select a vendor...</option>
                  {availableVendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="lastPrice" className="block text-sm font-medium text-gray-700">
                  Price (per {material.unitOfMeasure})
                </label>
                <input
                  type="number"
                  name="lastPrice"
                  id="lastPrice"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div>
                <label htmlFor="moq" className="block text-sm font-medium text-gray-700">
                  MOQ
                </label>
                <input
                  type="number"
                  name="moq"
                  id="moq"
                  min="0"
                  step="0.01"
                  placeholder="0"
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
                  min="0"
                  placeholder="0"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                  Notes
                </label>
                <input
                  type="text"
                  name="notes"
                  id="notes"
                  placeholder="Optional notes..."
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="preferred"
                  value="true"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Set as preferred vendor</span>
              </label>
            </div>

            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Add Vendor
            </button>
          </form>
        ) : allVendors.length === 0 ? (
          <div className="text-sm text-gray-500">
            <p>No vendors exist yet.</p>
            <Link href="/vendors/new" className="text-blue-600 hover:text-blue-900">
              Create your first vendor &rarr;
            </Link>
          </div>
        ) : (
          <p className="text-sm text-gray-500">All available vendors have been added.</p>
        )}
      </div>
    </div>
  );
}

