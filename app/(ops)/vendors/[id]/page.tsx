import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ArchiveButton } from "./ArchiveButton";
import { getVendorScorecard } from "@/lib/services/vendorService";

// Category labels
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

async function updateVendor(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const contactName = formData.get("contactName") as string;
  const contactEmail = formData.get("contactEmail") as string;
  const contactPhone = formData.get("contactPhone") as string;
  const address = formData.get("address") as string;
  const paymentTerms = formData.get("paymentTerms") as string;
  const defaultLeadTimeDays = parseInt(formData.get("defaultLeadTimeDays") as string, 10) || 0;
  const notes = formData.get("notes") as string;

  await prisma.vendor.update({
    where: { id },
    data: {
      name,
      contactName: contactName || null,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      address: address || null,
      paymentTerms: paymentTerms || null,
      defaultLeadTimeDays,
      notes: notes || null
    }
  });

  revalidatePath(`/vendors/${id}`);
  redirect(`/vendors/${id}`);
}

async function archiveVendor(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  await prisma.vendor.update({
    where: { id },
    data: { active: false }
  });
  revalidatePath("/vendors");
  redirect("/vendors");
}

export default async function VendorDetailPage({
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

  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      materials: {
        include: {
          material: true
        }
      },
      purchaseOrders: {
        take: 10,
        orderBy: { createdAt: "desc" }
      },
      _count: {
        select: {
          materials: true,
          purchaseOrders: true
        }
      }
    }
  });

  if (!vendor) notFound();

  // Get performance scorecard for last 90 days
  let scorecard = null;
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    scorecard = await getVendorScorecard(id, startDate, endDate);
  } catch {
    // Scorecard may fail if no PO data
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{vendor.name}</h1>
            {!vendor.active && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                Archived
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600">Vendor details and performance</p>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <Link
                href={`/vendors/${id}?edit=true`}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Edit
              </Link>
              {vendor.active && (
                <ArchiveButton vendorId={id} archiveAction={archiveVendor} />
              )}
            </>
          ) : (
            <Link
              href={`/vendors/${id}`}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </Link>
          )}
          <Link
            href="/vendors"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            &larr; Back
          </Link>
        </div>
      </div>

      {/* Details Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Vendor Details</h2>
        {isEditing ? (
          <form action={updateVendor} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input type="text" name="name" defaultValue={vendor.name} required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Contact Name</label>
                <input type="text" name="contactName" defaultValue={vendor.contactName || ""} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input type="email" name="contactEmail" defaultValue={vendor.contactEmail || ""} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <input type="tel" name="contactPhone" defaultValue={vendor.contactPhone || ""} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Payment Terms</label>
                <input type="text" name="paymentTerms" defaultValue={vendor.paymentTerms || ""} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Default Lead Time (Days)</label>
                <input type="number" name="defaultLeadTimeDays" defaultValue={vendor.defaultLeadTimeDays} min="0" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Address</label>
                <textarea name="address" rows={2} defaultValue={vendor.address || ""} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Notes</label>
                <textarea name="notes" rows={2} defaultValue={vendor.notes || ""} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm" />
              </div>
            </div>
            <div className="pt-4">
              <button type="submit" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700">
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Contact Name</dt>
              <dd className="mt-1 text-sm text-gray-900">{vendor.contactName || "—"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {vendor.contactEmail ? (
                  <a href={`mailto:${vendor.contactEmail}`} className="text-blue-600 hover:text-blue-900">
                    {vendor.contactEmail}
                  </a>
                ) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Phone</dt>
              <dd className="mt-1 text-sm text-gray-900">{vendor.contactPhone || "—"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Payment Terms</dt>
              <dd className="mt-1 text-sm text-gray-900">{vendor.paymentTerms || "—"}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Default Lead Time</dt>
              <dd className="mt-1 text-sm text-gray-900">{vendor.defaultLeadTimeDays} days</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Materials Supplied</dt>
              <dd className="mt-1 text-sm text-gray-900">{vendor._count.materials}</dd>
            </div>
            {vendor.address && (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-sm font-medium text-gray-500">Address</dt>
                <dd className="mt-1 text-sm text-gray-900 whitespace-pre-line">{vendor.address}</dd>
              </div>
            )}
            {vendor.notes && (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-sm font-medium text-gray-500">Notes</dt>
                <dd className="mt-1 text-sm text-gray-900 whitespace-pre-line">{vendor.notes}</dd>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Performance Scorecard */}
      {scorecard && scorecard.totalPOs > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Performance (Last 90 Days)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">Total POs</dt>
              <dd className="mt-1 text-2xl font-semibold text-gray-900">{scorecard.totalPOs}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">On-Time Delivery</dt>
              <dd className="mt-1 text-2xl font-semibold text-gray-900">
                {(scorecard.onTimeDeliveryRate * 100).toFixed(0)}%
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Avg Lead Time</dt>
              <dd className="mt-1 text-2xl font-semibold text-gray-900">
                {scorecard.avgLeadTimeDays.toFixed(1)} days
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Total Purchased</dt>
              <dd className="mt-1 text-2xl font-semibold text-gray-900">
                ${scorecard.totalValuePurchased.toLocaleString()}
              </dd>
            </div>
          </div>
        </div>
      )}

      {/* Materials Supplied */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Materials Supplied</h2>
        {vendor.materials.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Material</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Category</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Price</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">MOQ</th>
                <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">Lead Time</th>
                <th className="text-center text-xs font-medium text-gray-500 uppercase pb-2">Preferred</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vendor.materials.map((mv) => (
                <tr key={mv.id}>
                  <td className="py-2 text-sm">
                    <Link href={`/materials/${mv.materialId}`} className="text-blue-600 hover:text-blue-900">
                      {mv.material.name}
                    </Link>
                  </td>
                  <td className="py-2 text-sm text-gray-500">
                    {CATEGORY_LABELS[mv.material.category] || mv.material.category}
                  </td>
                  <td className="py-2 text-sm text-gray-900 text-right">
                    {mv.lastPrice ? `$${mv.lastPrice.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-2 text-sm text-gray-900 text-right">
                    {mv.moq > 0 ? mv.moq : "—"}
                  </td>
                  <td className="py-2 text-sm text-gray-900 text-right">
                    {mv.leadTimeDays ? `${mv.leadTimeDays} days` : "—"}
                  </td>
                  <td className="py-2 text-center">
                    {mv.preferred && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        Preferred
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No materials linked to this vendor yet.</p>
        )}
      </div>

      {/* Recent Purchase Orders */}
      {vendor.purchaseOrders.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Purchase Orders</h2>
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">PO #</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Status</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Created</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Expected</th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {vendor.purchaseOrders.map((po) => (
                <tr key={po.id}>
                  <td className="py-2 text-sm text-blue-600">
                    <Link href={`/purchase-orders/${po.id}`}>{po.poNumber}</Link>
                  </td>
                  <td className="py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      po.status === "RECEIVED" ? "bg-green-100 text-green-800" :
                      po.status === "SENT" ? "bg-blue-100 text-blue-800" :
                      po.status === "PARTIALLY_RECEIVED" ? "bg-yellow-100 text-yellow-800" :
                      po.status === "CANCELLED" ? "bg-red-100 text-red-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="py-2 text-sm text-gray-500">
                    {new Date(po.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 text-sm text-gray-500">
                    {po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2 text-sm text-gray-500">
                    {po.receivedAt ? new Date(po.receivedAt).toLocaleDateString() : "—"}
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

