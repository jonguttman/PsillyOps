import { auth } from "@/lib/auth/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import PurchaseOrderDetailClient from "./PurchaseOrderDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PurchaseOrderDetailPage({ params }: PageProps) {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  if (session.user.role === "REP") {
    redirect("/");
  }

  const { id } = await params;

  // Fetch PO with all related data
  const [purchaseOrder, locations, activityLogs] = await Promise.all([
    prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        vendor: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        lineItems: {
          include: {
            material: {
              select: { id: true, name: true, sku: true, unitOfMeasure: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    // Locations for receiving
    prisma.location.findMany({
      where: { active: true },
      select: { id: true, name: true, isDefaultReceiving: true },
      orderBy: { name: 'asc' },
    }),
    // Activity logs for this PO
    prisma.activityLog.findMany({
      where: {
        entityType: 'PURCHASE_ORDER',
        entityId: id,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  if (!purchaseOrder) {
    notFound();
  }

  // Transform for client
  const transformedPO = {
    id: purchaseOrder.id,
    poNumber: purchaseOrder.poNumber,
    status: purchaseOrder.status,
    vendor: purchaseOrder.vendor,
    createdBy: purchaseOrder.createdBy,
    expectedDeliveryDate: purchaseOrder.expectedDeliveryDate?.toISOString() || null,
    sentAt: purchaseOrder.sentAt?.toISOString() || null,
    receivedAt: purchaseOrder.receivedAt?.toISOString() || null,
    createdAt: purchaseOrder.createdAt.toISOString(),
    updatedAt: purchaseOrder.updatedAt.toISOString(),
    lineItems: purchaseOrder.lineItems.map((li) => ({
      id: li.id,
      material: li.material,
      quantityOrdered: li.quantityOrdered,
      quantityReceived: li.quantityReceived,
      unitCost: li.unitCost,
      lotNumber: li.lotNumber,
      expiryDate: li.expiryDate?.toISOString() || null,
    })),
  };

  const transformedActivity = activityLogs.map((log) => ({
    id: log.id,
    action: log.action,
    summary: log.summary,
    createdAt: log.createdAt.toISOString(),
    user: log.user,
    details: log.metadata as Record<string, any> | null,
  }));

  const canEdit = ['ADMIN', 'WAREHOUSE'].includes(session.user.role);

  return (
    <PurchaseOrderDetailClient
      purchaseOrder={transformedPO}
      locations={locations}
      activityLogs={transformedActivity}
      canEdit={canEdit}
    />
  );
}

