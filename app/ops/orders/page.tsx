import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { OrdersListClient } from "./OrdersListClient";

export default async function OrdersPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  if (session.user.role === "REP") {
    redirect("/");
  }

  const orders = await prisma.retailerOrder.findMany({
    include: {
      retailer: true,
      lineItems: {
        include: {
          product: true,
        },
      },
      invoices: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Calculate totals for each order and prepare data for client component
  const ordersWithTotals = orders.map((order) => {
    const total = order.lineItems.reduce((sum, item) => {
      if (item.lineTotal !== null) {
        return sum + item.lineTotal;
      }
      const price = item.unitWholesalePrice ?? item.product.wholesalePrice ?? 0;
      return sum + price * item.quantityOrdered;
    }, 0);
    
    const itemCount = order.lineItems.reduce(
      (sum, item) => sum + item.quantityOrdered,
      0
    );

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt,
      createdByAI: order.createdByAI,
      aiReviewedAt: order.aiReviewedAt,
      retailer: {
        name: order.retailer.name,
      },
      total,
      itemCount,
      hasInvoice: order.invoices.length > 0,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage retailer orders and invoices
          </p>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <OrdersListClient 
          orders={ordersWithTotals} 
          userRole={session.user.role} 
        />
      </div>
    </div>
  );
}
