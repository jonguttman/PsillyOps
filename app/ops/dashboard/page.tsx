import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import DashboardAiInput from "@/components/dashboard/DashboardAiInput";
import AlertsPanel from "@/components/dashboard/AlertsPanel";
import StatsStrip from "@/components/dashboard/StatsStrip";
import ActivityFeed from "@/components/dashboard/ActivityFeed";
import RecentQRScans from "@/components/dashboard/RecentQRScans";
import SupplyWatchCard from "@/components/dashboard/SupplyWatchCard";
import ProductionAttentionCard from "@/components/dashboard/ProductionAttentionCard";
import { getLowStockMaterials } from "@/lib/services/inventoryService";
import { getRecentAdjustments } from "@/lib/services/inventoryAdjustmentService";
import { MobileDashboard } from "@/components/mobile";
import { UnassignedProductionRunsQueue } from "@/components/production/UnassignedProductionRunsQueue";
import { UnassignedProductionOrdersQueue } from "@/components/production/UnassignedProductionOrdersQueue";

export default async function AdminDashboardPage() {
  const session = await auth();

  // Not logged in → send to login
  if (!session || !session.user) {
    redirect("/login");
  }

  // Not an admin → send to dashboard root (or login fallback)
  if (session.user.role !== "ADMIN") {
    redirect("/ops/dashboard");
  }

  // Fetch all dashboard data in parallel
  let lowStock;
  let recentManualAdjustments;
  let blockedOrders;
  let qcHoldBatches;
  let ordersWithShortages;
  let ordersAwaitingInvoice;
  let activeProductionOrders;
  let openRetailerOrders;
  let pendingPurchaseOrders;
  let awaitingInvoiceCount;
  let recentActivity;
  let openPurchaseOrders;
  let lastReceivedPO;
  let unassignedProductionRuns;

  try {
    [
      lowStock,
      recentManualAdjustments,
      blockedOrders,
      qcHoldBatches,
      ordersWithShortages,
      ordersAwaitingInvoice,
      activeProductionOrders,
      openRetailerOrders,
      pendingPurchaseOrders,
      awaitingInvoiceCount,
      recentActivity,
      openPurchaseOrders,
      lastReceivedPO,
      unassignedProductionRuns,
      unassignedProductionOrders,
    ] = await Promise.all([
      // Supply watch: low stock materials
      getLowStockMaterials(),
      // Supply watch: manual adjustments (last 48h)
      getRecentAdjustments({ hours: 48, adjustmentType: "MANUAL_CORRECTION" }),
      // Blocked production orders (exclude archived)
      prisma.productionOrder.findMany({
        where: { status: "BLOCKED", archivedAt: null },
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
      // Open purchase orders (DRAFT, SENT, or PARTIALLY_RECEIVED)
      prisma.purchaseOrder.count({
        where: { status: { in: ["DRAFT", "SENT", "PARTIALLY_RECEIVED"] } },
      }),
      // Last received PO
      prisma.purchaseOrder.findFirst({
        where: { status: "RECEIVED" },
        orderBy: { receivedAt: "desc" },
        select: { receivedAt: true },
      }),
      // Unassigned production runs (PLANNED or IN_PROGRESS, no assignee)
      prisma.productionRun.findMany({
        where: {
          status: { in: ["PLANNED", "IN_PROGRESS"] },
          assignedToUserId: null,
        },
        select: {
          id: true,
          quantity: true,
          status: true,
          createdAt: true,
          product: { select: { id: true, name: true, sku: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 20, // Limit to prevent overwhelming the queue
      }),
      // Unassigned production orders (PLANNED, no assignee)
      prisma.productionOrder.findMany({
        where: {
          status: "PLANNED",
          assignedToUserId: null,
        },
        select: {
          id: true,
          orderNumber: true,
          quantityToMake: true,
          scheduledDate: true,
          createdAt: true,
          product: { select: { id: true, name: true, sku: true } },
        },
        orderBy: [{ scheduledDate: "asc" }, { createdAt: "asc" }],
        take: 20,
      }),
    ]);
  } catch (e: unknown) {
    throw e;
  }

  const lowStockMaterials = lowStock.materials;

  // Calculate days since last PO receipt
  const daysSinceLastReceipt = lastReceivedPO?.receivedAt
    ? Math.floor(
        (Date.now() - new Date(lastReceivedPO.receivedAt).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    : null;

  // Calculate alerts count for mobile
  const alertsCount = 
    lowStockMaterials.length + 
    blockedOrders.length + 
    qcHoldBatches.length + 
    ordersWithShortages.length + 
    ordersAwaitingInvoice.length;

  // Mobile dashboard data
  const mobileDashboardData = {
    lowStockMaterials: lowStockMaterials.map((m) => ({
      id: m.id,
      name: m.name,
      currentStockQty: m.currentStockQty,
      reorderPoint: m.reorderPoint,
    })),
    blockedOrders,
    qcHoldBatches,
    activeProductionOrders,
    recentActivity,
    alertsCount,
  };

  return (
    <>
      {/* ========================================
          Desktop Dashboard - hidden on mobile
          ======================================== */}
      <div className="hidden md:block space-y-4">
        {/* AI Command Input - Primary */}
        <DashboardAiInput userRole={session.user.role} />

        {/* Stats Strip - Context Only */}
        <StatsStrip
          lowStockCount={lowStockMaterials.length}
          activeProductionOrders={activeProductionOrders}
          openRetailerOrders={openRetailerOrders}
          pendingPurchaseOrders={pendingPurchaseOrders}
          awaitingInvoiceCount={awaitingInvoiceCount}
        />

        {/* Unassigned Production Orders Queue */}
        <UnassignedProductionOrdersQueue
          orders={unassignedProductionOrders.map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            quantityToMake: order.quantityToMake,
            scheduledDate: order.scheduledDate?.toISOString() || null,
            createdAt: order.createdAt.toISOString(),
            product: order.product,
          }))}
          userRole={session.user.role}
        />

        {/* Unassigned Production Runs Queue */}
        <UnassignedProductionRunsQueue
          runs={unassignedProductionRuns.map((run) => ({
            id: run.id,
            product: run.product,
            quantity: run.quantity,
            status: run.status,
            createdAt: run.createdAt.toISOString(),
          }))}
          userRole={session.user.role}
        />

        {/* Actionable Alerts */}
        <AlertsPanel
          lowStockMaterials={lowStockMaterials}
          blockedOrders={blockedOrders}
          qcHoldBatches={qcHoldBatches}
          ordersWithShortages={ordersWithShortages}
          ordersAwaitingInvoice={ordersAwaitingInvoice}
        />

        {/* Supply Watch */}
        <SupplyWatchCard
          lowStockMaterials={lowStockMaterials.map((m) => ({
            id: m.id,
            name: m.name,
            currentStockQty: m.currentStockQty,
            reorderPoint: m.reorderPoint,
          }))}
          recentManualAdjustments={(recentManualAdjustments.adjustments || [])
            .filter((a: (typeof recentManualAdjustments.adjustments)[number]) => a.inventory.type === "MATERIAL")
            .map((a: (typeof recentManualAdjustments.adjustments)[number]) => ({
              id: a.id,
              createdAt: a.createdAt,
              deltaQty: a.deltaQty,
              reason: a.reason,
              inventory: {
                id: a.inventory.id,
                type: a.inventory.type,
                product: a.inventory.product,
                material: a.inventory.material,
              },
            }))}
          openPOsCount={openPurchaseOrders}
          daysSinceLastReceipt={daysSinceLastReceipt}
        />

        {/* Production Attention */}
        <ProductionAttentionCard />

        {/* Recent QR Scans */}
        <RecentQRScans />

        {/* Recent Activity Feed */}
        <ActivityFeed activities={recentActivity} />
      </div>

      {/* ========================================
          Mobile Dashboard - hidden on desktop
          ======================================== */}
      <div className="block md:hidden">
        <MobileDashboard data={mobileDashboardData} />
      </div>
    </>
  );
}

