import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ArchiveButton } from "./ArchiveButton";
import { DeleteButton } from "./DeleteButton";
import { SetPreferredButton } from "./SetPreferredButton";
import { AddAttachmentForm } from "./AddAttachmentForm";
import TooltipWrapper from "@/components/ui/TooltipWrapper";
import { MaterialCategory } from "@/lib/types/enums";
import { canDeleteMaterial } from "@/lib/services/materialService";

const UNIT_OPTIONS = ["kg", "g", "mg", "L", "mL", "oz", "lb", "pcs", "units", "sheets", "rolls", "boxes", "each"];
const MATERIAL_CATEGORY_GROUPS: Record<string, MaterialCategory[]> = {
  Ingredients: [MaterialCategory.ACTIVE_INGREDIENT, MaterialCategory.SECONDARY_INGREDIENT],
  'Dosage & Delivery': [
    MaterialCategory.CAPSULES,
    MaterialCategory.STRAWS_STICKS,
    MaterialCategory.POWDERS_FILLERS,
  ],
  Packaging: [MaterialCategory.PRIMARY_PACKAGING, MaterialCategory.SECONDARY_PACKAGING, MaterialCategory.SEALS_SECURITY],
  'Labels & Print': [MaterialCategory.LABELS, MaterialCategory.PAPER_PRINT],
  'Logistics & Operations': [MaterialCategory.SHIPPING, MaterialCategory.PRODUCTION_SUPPLIES, MaterialCategory.EQUIPMENT],
};

const CATEGORY_COLORS: Record<string, string> = {
  [MaterialCategory.ACTIVE_INGREDIENT]: "bg-purple-100 text-purple-800",
  [MaterialCategory.SECONDARY_INGREDIENT]: "bg-purple-100 text-purple-800",

  [MaterialCategory.CAPSULES]: "bg-teal-100 text-teal-800",
  [MaterialCategory.STRAWS_STICKS]: "bg-teal-100 text-teal-800",
  [MaterialCategory.POWDERS_FILLERS]: "bg-teal-100 text-teal-800",

  [MaterialCategory.PRIMARY_PACKAGING]: "bg-gray-100 text-gray-800",
  [MaterialCategory.SECONDARY_PACKAGING]: "bg-gray-100 text-gray-800",
  [MaterialCategory.SEALS_SECURITY]: "bg-gray-100 text-gray-800",

  [MaterialCategory.LABELS]: "bg-yellow-100 text-yellow-800",
  [MaterialCategory.PAPER_PRINT]: "bg-yellow-100 text-yellow-800",

  [MaterialCategory.SHIPPING]: "bg-indigo-100 text-indigo-800",
  [MaterialCategory.PRODUCTION_SUPPLIES]: "bg-slate-100 text-slate-800",
  [MaterialCategory.EQUIPMENT]: "bg-slate-100 text-slate-800",
};

async function updateMaterial(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const sku = formData.get("sku") as string;
  const unitOfMeasure = formData.get("unitOfMeasure") as string;
  const category = formData.get("category") as string;
  const description = formData.get("description") as string;
  const reorderPoint = parseFloat(formData.get("reorderPoint") as string) || 0;
  const reorderQuantity = parseFloat(formData.get("reorderQuantity") as string) || 0;
  const moq = parseFloat(formData.get("moq") as string) || 0;
  const leadTimeDays = parseInt(formData.get("leadTimeDays") as string, 10) || 0;

  if (!category || !Object.values(MaterialCategory).includes(category as MaterialCategory)) {
    throw new Error("Category is required");
  }

  await prisma.rawMaterial.update({
    where: { id },
    data: {
      name,
      sku,
      unitOfMeasure,
      category: category as unknown as any,
      description: description || null,
      reorderPoint,
      reorderQuantity,
      moq,
      leadTimeDays
    }
  });

  revalidatePath(`/ops/materials/${id}`);
  redirect(`/ops/materials/${id}`);
}

async function archiveMaterial(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  await prisma.rawMaterial.update({
    where: { id },
    data: { 
      active: false,
      archivedAt: new Date()
    }
  });
  revalidatePath("/ops/materials");
  redirect("/ops/materials");
}

async function deleteMaterial(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  
  // Call the API endpoint to handle deletion with guards
  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/materials/${id}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete material');
  }

  revalidatePath("/ops/materials");
  redirect("/ops/materials");
}

async function setPreferredVendor(formData: FormData) {
  "use server";
  const materialId = formData.get("materialId") as string;
  const vendorId = formData.get("vendorId") as string;

  // Unset all preferred for this material
  await prisma.materialVendor.updateMany({
    where: { materialId },
    data: { preferred: false }
  });

  // Set the new preferred vendor
  await prisma.materialVendor.updateMany({
    where: { materialId, vendorId },
    data: { preferred: true }
  });

  // Update material's preferredVendorId
  await prisma.rawMaterial.update({
    where: { id: materialId },
    data: { preferredVendorId: vendorId }
  });

  revalidatePath(`/materials/${materialId}`);
}

async function addAttachment(formData: FormData) {
  "use server";
  const materialId = formData.get("materialId") as string;
  const fileName = formData.get("fileName") as string;
  const fileUrl = formData.get("fileUrl") as string;
  const fileType = formData.get("fileType") as string;

  await prisma.materialAttachment.create({
    data: {
      materialId,
      fileName,
      fileUrl,
      fileType: fileType || "OTHER"
    }
  });

  revalidatePath(`/materials/${materialId}`);
}

async function removeAttachment(formData: FormData) {
  "use server";
  const attachmentId = formData.get("attachmentId") as string;
  const materialId = formData.get("materialId") as string;

  await prisma.materialAttachment.delete({
    where: { id: attachmentId }
  });

  revalidatePath(`/materials/${materialId}`);
}

export default async function MaterialDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await auth();
  if (!session || !session.user) redirect("/login");
  if (session.user.role === "REP") redirect("/");

  const { id } = await params;
  const { edit } = await searchParams;
  const isEditing = edit === "true";

  const material = await prisma.rawMaterial.findUnique({
    where: { id },
    include: {
      preferredVendor: true,
      vendors: {
        include: { vendor: true },
        orderBy: { preferred: "desc" }
      },
      inventory: {
        where: { status: "AVAILABLE" },
        include: { location: true }
      },
      costHistory: {
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { vendor: true }
      },
      attachments: {
        orderBy: { uploadedAt: "desc" }
      },
      bomUsage: {
        where: { active: true },
        include: { product: true }
      }
    }
  });

  if (!material) notFound();

  // Calculate inventory totals
  const totalOnHand = material.inventory.reduce((sum, i) => sum + i.quantityOnHand, 0);
  const inventoryByLocation = material.inventory.reduce((acc, i) => {
    acc[i.location.name] = (acc[i.location.name] || 0) + i.quantityOnHand;
    return acc;
  }, {} as Record<string, number>);

  // Get current cost
  const preferredMv = material.vendors.find(v => v.preferred);
  const currentCost = preferredMv?.lastPrice || material.vendors[0]?.lastPrice || null;

  // Check if material can be deleted
  const deleteCheck = await canDeleteMaterial(id);
  const canDelete = deleteCheck.canDelete;
  const deleteReason = deleteCheck.reason;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{material.name}</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              {material.sku}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                CATEGORY_COLORS[material.category] || "bg-gray-100 text-gray-800"
              }`}
            >
              {material.category}
            </span>
            {material.archivedAt && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                Archived
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600">Material details and vendor relationships</p>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <Link
                href={`/ops/materials/${id}?edit=true`}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Edit
              </Link>
              {!material.archivedAt && (
                <ArchiveButton materialId={id} archiveAction={archiveMaterial} />
              )}
              {material.archivedAt && (
                <DeleteButton 
                  materialId={id}
                  materialName={material.name}
                  canDelete={canDelete}
                  deleteReason={deleteReason}
                  deleteAction={deleteMaterial}
                />
              )}
            </>
          ) : (
            <Link
              href={`/materials/${id}`}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </Link>
          )}
          <TooltipWrapper tooltipId="view-qr-code" userRole={session.user.role} position="bottom">
            <Link
              href={`/qr/material/${id}`}
              target="_blank"
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              View QR Code
            </Link>
          </TooltipWrapper>
          <Link
            href="/ops/materials"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            &larr; Back
          </Link>
        </div>
      </div>

      {/* Details Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Material Details</h2>
        {isEditing ? (
          <form action={updateMaterial} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input type="text" name="name" defaultValue={material.name} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">SKU</label>
                <input type="text" name="sku" defaultValue={material.sku} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Category</label>
                <select
                  name="category"
                  required
                  defaultValue={material.category || ""}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="" disabled>
                    Select a category…
                  </option>
                  {Object.entries(MATERIAL_CATEGORY_GROUPS).map(([groupLabel, cats]) => (
                    <optgroup key={groupLabel} label={groupLabel}>
                      {cats.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Unit of Measure</label>
                <select name="unitOfMeasure" defaultValue={material.unitOfMeasure} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm">
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Reorder Point</label>
                <input type="number" name="reorderPoint" defaultValue={material.reorderPoint} min="0" step="0.01" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Reorder Quantity</label>
                <input type="number" name="reorderQuantity" defaultValue={material.reorderQuantity} min="0" step="0.01" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">MOQ</label>
                <input type="number" name="moq" defaultValue={material.moq} min="0" step="0.01" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Lead Time (Days)</label>
                <input type="number" name="leadTimeDays" defaultValue={material.leadTimeDays} min="0" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea name="description" rows={2} defaultValue={material.description || ""} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
            </div>
            <div className="pt-4">
              <button type="submit" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700">
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <div><dt className="text-sm font-medium text-gray-500">Unit of Measure</dt><dd className="mt-1 text-sm text-gray-900">{material.unitOfMeasure}</dd></div>
            <div><dt className="text-sm font-medium text-gray-500">Reorder Point</dt><dd className="mt-1 text-sm text-gray-900">{material.reorderPoint}</dd></div>
            <div><dt className="text-sm font-medium text-gray-500">Reorder Quantity</dt><dd className="mt-1 text-sm text-gray-900">{material.reorderQuantity}</dd></div>
            <div><dt className="text-sm font-medium text-gray-500">MOQ</dt><dd className="mt-1 text-sm text-gray-900">{material.moq}</dd></div>
            <div><dt className="text-sm font-medium text-gray-500">Lead Time</dt><dd className="mt-1 text-sm text-gray-900">{material.leadTimeDays} days</dd></div>
            <div><dt className="text-sm font-medium text-gray-500">Current Cost</dt><dd className="mt-1 text-sm text-gray-900">{currentCost ? `$${currentCost.toFixed(2)}` : "—"}</dd></div>
            {material.description && (
              <div className="col-span-2"><dt className="text-sm font-medium text-gray-500">Description</dt><dd className="mt-1 text-sm text-gray-900">{material.description}</dd></div>
            )}
          </dl>
        )}
      </div>

      {/* Inventory Summary */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Inventory Summary</h2>
        <div className="mb-4">
          <span className="text-3xl font-semibold text-gray-900">{totalOnHand.toLocaleString()}</span>
          <span className="ml-2 text-sm text-gray-500">{material.unitOfMeasure} on hand</span>
        </div>
        {Object.keys(inventoryByLocation).length > 0 ? (
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">By Location</h3>
            <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Object.entries(inventoryByLocation).map(([loc, qty]) => (
                <div key={loc}><dt className="text-sm text-gray-500">{loc}</dt><dd className="text-sm font-medium text-gray-900">{qty.toLocaleString()}</dd></div>
              ))}
            </dl>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No inventory records</p>
        )}
      </div>

      {/* Vendors Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">Vendor Relationships</h2>
          <Link href={`/materials/${id}/vendors`} className="text-sm text-blue-600 hover:text-blue-900">
            Manage Vendors &rarr;
          </Link>
        </div>
        {material.vendors.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Vendor</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Price</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">MOQ</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Lead Time</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase pb-2">Preferred</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {material.vendors.map(mv => (
                <tr key={mv.id}>
                  <td className="py-2 text-sm text-gray-900">
                    <Link href={`/vendors/${mv.vendorId}`} className="text-blue-600 hover:text-blue-900">{mv.vendor.name}</Link>
                  </td>
                  <td className="py-2 text-sm text-gray-900 text-right">{mv.lastPrice ? `$${mv.lastPrice.toFixed(2)}` : "—"}</td>
                  <td className="py-2 text-sm text-gray-900 text-right">{mv.moq > 0 ? mv.moq : "—"}</td>
                  <td className="py-2 text-sm text-gray-900 text-right">{mv.leadTimeDays ? `${mv.leadTimeDays} days` : "—"}</td>
                  <td className="py-2 text-center">
                    {mv.preferred ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Preferred</span>
                    ) : (
                      <SetPreferredButton materialId={id} vendorId={mv.vendorId} action={setPreferredVendor} />
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <Link href={`/materials/${id}/vendors`} className="text-sm text-blue-600 hover:text-blue-900">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No vendors assigned. <Link href={`/materials/${id}/vendors`} className="text-blue-600 hover:text-blue-900">Add vendors</Link></p>
        )}
      </div>

      {/* Cost History */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Cost History</h2>
        {material.costHistory.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Date</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Vendor</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Price</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {material.costHistory.map(ch => (
                <tr key={ch.id}>
                  <td className="py-2 text-sm text-gray-500">{new Date(ch.createdAt).toLocaleDateString()}</td>
                  <td className="py-2 text-sm text-gray-900">{ch.vendor?.name || "—"}</td>
                  <td className="py-2 text-sm text-gray-900 text-right">${ch.price.toFixed(2)}</td>
                  <td className="py-2 text-sm text-gray-500">{ch.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No cost history recorded</p>
        )}
      </div>

      {/* Attachments */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">Attachments</h2>
          <AddAttachmentForm materialId={id} addAction={addAttachment} />
        </div>
        {material.attachments.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">File Name</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Type</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Uploaded</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {material.attachments.map(att => (
                <tr key={att.id}>
                  <td className="py-2 text-sm text-blue-600">
                    <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{att.fileName}</a>
                  </td>
                  <td className="py-2 text-sm text-gray-500">{att.fileType}</td>
                  <td className="py-2 text-sm text-gray-500">{new Date(att.uploadedAt).toLocaleDateString()}</td>
                  <td className="py-2 text-right">
                    <form action={removeAttachment} className="inline">
                      <input type="hidden" name="attachmentId" value={att.id} />
                      <input type="hidden" name="materialId" value={id} />
                      <button type="submit" className="text-sm text-red-600 hover:text-red-900">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No attachments. Add COA, MSDS, or spec sheets above.</p>
        )}
      </div>

      {/* BOM Usage */}
      {material.bomUsage.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Used in Products</h2>
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Product</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Qty per Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {material.bomUsage.map(bom => (
                <tr key={bom.id}>
                  <td className="py-2 text-sm">
                    <Link href={`/ops/products/${bom.productId}`} className="text-blue-600 hover:text-blue-900">{bom.product.name}</Link>
                  </td>
                  <td className="py-2 text-sm text-gray-900 text-right">{bom.quantityPerUnit} {material.unitOfMeasure}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

