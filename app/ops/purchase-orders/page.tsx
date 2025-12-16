import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import { Plus } from "lucide-react";
import PurchaseOrdersClient from "./PurchaseOrdersClient";

export default async function PurchaseOrdersPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  if (session.user.role === "REP") {
    redirect("/");
  }

  // Fetch initial data in parallel
  const [purchaseOrdersResult, vendors] = await Promise.all([
    // Purchase orders with vendor and line items
    prisma.purchaseOrder.findMany({
      include: {
        vendor: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        lineItems: {
          select: {
            id: true,
            quantityOrdered: true,
            quantityReceived: true,
            unitCost: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    // Vendors for filter dropdown
    prisma.vendor.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const totalCount = await prisma.purchaseOrder.count();

  // Transform for client
  const purchaseOrders = purchaseOrdersResult.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    status: po.status,
    vendor: po.vendor,
    createdBy: po.createdBy,
    expectedDeliveryDate: po.expectedDeliveryDate?.toISOString() || null,
    createdAt: po.createdAt.toISOString(),
    lineItemCount: po.lineItems.length,
    totalValue: po.lineItems.reduce(
      (sum, li) => sum + li.quantityOrdered * (li.unitCost || 0),
      0
    ),
    receivedPercentage: po.lineItems.length > 0
      ? Math.round(
          (po.lineItems.reduce((sum, li) => sum + li.quantityReceived, 0) /
            po.lineItems.reduce((sum, li) => sum + li.quantityOrdered, 0)) *
            100
        )
      : 0,
  }));

  const canCreate = ['ADMIN', 'WAREHOUSE'].includes(session.user.role);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
          <p className="text-sm text-gray-600 mt-1">
            Track material orders from vendors and receiving status.
          </p>
        </div>
        {canCreate && (
          <Link
            href="/ops/purchase-orders/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New PO
          </Link>
        )}
      </div>

      {/* Client Component */}
      <PurchaseOrdersClient
        initialPurchaseOrders={purchaseOrders}
        initialTotal={totalCount}
        vendors={vendors}
      />
    </div>
  );
}
