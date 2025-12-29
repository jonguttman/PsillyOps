"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils/formatters";
import { hasPermission } from "@/lib/auth/rbac";
import { UserRole } from "@prisma/client";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: Date;
  createdByAI: boolean;
  aiReviewedAt: Date | null;
  retailer: {
    name: string;
  };
  total: number;
  itemCount: number;
  hasInvoice: boolean;
}

interface OrdersListClientProps {
  orders: Order[];
  userRole: string;
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  SUBMITTED: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-blue-100 text-blue-800",
  IN_FULFILLMENT: "bg-purple-100 text-purple-800",
  SHIPPED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

type ToastType = "success" | "error" | "warning";

interface Toast {
  type: ToastType;
  message: string;
}

export function OrdersListClient({ orders, userRole }: OrdersListClientProps) {
  const router = useRouter();
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const role = userRole as UserRole;
  const canSubmit = hasPermission(role, "orders", "create") || hasPermission(role, "orders", "update");

  const showToast = useCallback((type: ToastType, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), type === "error" ? 5000 : 3000);
  }, []);

  const handleSubmit = async (orderId: string) => {
    setLoadingOrderId(orderId);
    setConfirmingOrderId(null);

    try {
      const response = await fetch(`/api/orders/${orderId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to submit order");
      }

      const result = await response.json();
      const productionCount = result.productionOrdersCreated?.length || 0;
      const purchaseCount = result.purchaseOrdersCreated?.length || 0;
      
      let message = "Order submitted successfully.";
      if (productionCount > 0 || purchaseCount > 0) {
        const parts = [];
        if (productionCount > 0) parts.push(`${productionCount} production order${productionCount > 1 ? "s" : ""}`);
        if (purchaseCount > 0) parts.push(`${purchaseCount} purchase order${purchaseCount > 1 ? "s" : ""}`);
        message += ` ${parts.join(" and ")} created.`;
      }
      
      showToast("success", message);
      router.refresh();
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "An unexpected error occurred");
    } finally {
      setLoadingOrderId(null);
    }
  };

  const handleMarkReviewed = async (orderId: string) => {
    setLoadingOrderId(orderId);

    try {
      const response = await fetch(`/api/orders/${orderId}/mark-reviewed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to mark order as reviewed");
      }

      showToast("success", "Order marked as reviewed");
      router.refresh();
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "An unexpected error occurred");
    } finally {
      setLoadingOrderId(null);
    }
  };

  return (
    <>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Order
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Retailer
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Items
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total
            </th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Invoice
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {orders.map((order) => {
            const isDraft = order.status === "DRAFT";
            const isAIUnreviewed = order.createdByAI && !order.aiReviewedAt;
            const isLoading = loadingOrderId === order.id;
            const isConfirming = confirmingOrderId === order.id;

            return (
              <tr key={order.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/ops/orders/${order.id}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-900"
                    >
                      {order.orderNumber}
                    </Link>
                    {order.createdByAI && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                        AI
                        {order.aiReviewedAt && (
                          <svg className="w-3 h-3 ml-0.5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{order.retailer.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      STATUS_STYLES[order.status] || "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {order.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                  {order.itemCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                  {formatCurrency(order.total)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-center">
                  {order.hasInvoice ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
                      ✓ Invoiced
                    </span>
                  ) : order.status === "SHIPPED" ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                      Awaiting
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(order.createdAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  {isDraft && canSubmit && (
                    <div className="flex items-center justify-end gap-2">
                      {isAIUnreviewed ? (
                        <button
                          onClick={() => handleMarkReviewed(order.id)}
                          disabled={isLoading}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-purple-100 text-purple-800 hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isLoading ? (
                            <>
                              <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Reviewing...
                            </>
                          ) : (
                            "Review"
                          )}
                        </button>
                      ) : isConfirming ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleSubmit(order.id)}
                            disabled={isLoading}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            {isLoading ? "..." : "Confirm"}
                          </button>
                          <button
                            onClick={() => setConfirmingOrderId(null)}
                            disabled={isLoading}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium rounded bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmingOrderId(order.id)}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200"
                        >
                          Submit
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {orders.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No orders found</p>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 ${
            toast.type === "success"
              ? "bg-green-500 text-white"
              : toast.type === "error"
              ? "bg-red-500 text-white"
              : "bg-amber-500 text-white"
          }`}
          style={{ animation: "slide-up 0.3s ease-out" }}
        >
          {toast.type === "success" && (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
          {toast.type === "error" && (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}

