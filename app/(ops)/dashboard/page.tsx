import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import DashboardAiInput from "@/components/dashboard/DashboardAiInput";
import AlertsPanel from "@/components/dashboard/AlertsPanel";
import StatsStrip from "@/components/dashboard/StatsStrip";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import RecentQRScans from "@/components/dashboard/RecentQRScans";

export default async function AdminDashboardPage() {
  const session = await auth();

  // Not logged in → send to login
  if (!session || !session.user) {
    redirect("/login");
  }

  // Not an admin → send to home
  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  // Fetch all dashboard data in parallel
  const [
    allMaterials,
    blockedOrders,
    qcHoldBatches,
    ordersWithShortages,
    ordersAwaitingInvoice,
    activeProductionOrders,
    openRetailerOrders,
    pendingPurchaseOrders,
    awaitingInvoiceCount,
    recentActivity,
  ] = await Promise.all([
    // Materials for low-stock check
    prisma.rawMaterial.findMany({
      where: { active: true },
      select: { id: true, name: true, currentStockQty: true, reorderPoint: true },
    }),
    // Blocked production orders
    prisma.productionOrder.findMany({
      where: { status: "BLOCKED" },
      select: { id: true, orderNumber: true, product: { select: { name: true } } },
    }),
    // QC Hold batches
    prisma.batch.findMany({
      where: { qcStatus: "HOLD" },
      select: { id: true, batchCode: true, product: { select: { name: true } } },
    }),
    // Orders with shortages
    prisma.retailerOrder.findMany({
      where: {
        lineItems: { some: { shortageQuantity: { gt: 0 } } },
        status: { notIn: ["CANCELLED", "SHIPPED"] },
      },
      select: { id: true, orderNumber: true, retailer: { select: { name: true } } },
    }),
    // Orders shipped but not invoiced
    prisma.retailerOrder.findMany({
      where: {
        status: "SHIPPED",
        invoices: { none: {} },
      },
      select: { id: true, orderNumber: true, retailer: { select: { name: true } } },
    }),
    // Active production orders count (PLANNED or IN_PROGRESS)
    prisma.productionOrder.count({
      where: { status: { in: ["PLANNED", "IN_PROGRESS"] } },
    }),
    // Open retailer orders count
    prisma.retailerOrder.count({
      where: { status: { in: ["SUBMITTED", "APPROVED", "IN_FULFILLMENT"] } },
    }),
    // Pending purchase orders count
    prisma.purchaseOrder.count({
      where: { status: { in: ["DRAFT", "SENT"] } },
    }),
    // Orders awaiting invoice count
    prisma.retailerOrder.count({
      where: {
        status: "SHIPPED",
        invoices: { none: {} },
      },
    }),
    // Recent activity
    prisma.activityLog.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    }),
  ]);

  // Filter low-stock materials
  const lowStockMaterials = allMaterials.filter(
    (m) => m.currentStockQty < m.reorderPoint
  );

  return (
    <div className="space-y-4">
      {/* AI Command Input - Primary */}
      <DashboardAiInput userRole={session.user.role} />

      {/* Actionable Alerts */}
      <AlertsPanel
        lowStockMaterials={lowStockMaterials}
        blockedOrders={blockedOrders}
        qcHoldBatches={qcHoldBatches}
        ordersWithShortages={ordersWithShortages}
        ordersAwaitingInvoice={ordersAwaitingInvoice}
      />

      {/* Stats Strip - Context Only */}
      <StatsStrip
        lowStockCount={lowStockMaterials.length}
        activeProductionOrders={activeProductionOrders}
        openRetailerOrders={openRetailerOrders}
        pendingPurchaseOrders={pendingPurchaseOrders}
        awaitingInvoiceCount={awaitingInvoiceCount}
      />

      {/* Recent QR Scans */}
      <RecentQRScans />

      {/* Recent Activity Feed */}
      <ActivityFeed activities={recentActivity} />
    </div>
  );
}

