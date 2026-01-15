"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ORDER_ACTIONS, ORDER_ACTION_LABELS, type OrderAction } from "@/lib/constants/orderActions";
import { OrderActionModal } from "./OrderActionModal";
import { hasPermission } from "@/lib/auth/rbac";
import { UserRole } from "@prisma/client";

interface OrderActionsProps {
  orderId: string;
  orderNumber: string;
  status: string;
  userRole: string;
  createdByAI: boolean;
  aiReviewedAt: Date | null;
  retailerName: string;
  itemCount: number;
  orderTotal: number;
  shortages: Array<{ productName: string; shortage: number }>;
}

type ToastType = "success" | "error" | "warning";

interface Toast {
  type: ToastType;
  message: string;
}

export function OrderActions({
  orderId,
  orderNumber,
  status,
  userRole,
  createdByAI,
  aiReviewedAt,
  retailerName,
  itemCount,
  orderTotal,
  shortages,
}: OrderActionsProps) {
  const router = useRouter();
  const [activeModal, setActiveModal] = useState<OrderAction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
  const [optimisticReviewed, setOptimisticReviewed] = useState<boolean | null>(null);

  const showToast = useCallback((type: ToastType, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), type === "error" ? 5000 : 3000);
  }, []);

  const role = userRole as UserRole;
  const currentStatus = optimisticStatus || status;
  const isReviewed = optimisticReviewed !== null ? optimisticReviewed : !!aiReviewedAt;

  // Determine which actions are available based on status
  const getAvailableActions = (): OrderAction[] => {
    switch (currentStatus) {
      case "DRAFT":
        return createdByAI && !isReviewed
          ? [ORDER_ACTIONS.MARK_REVIEWED, ORDER_ACTIONS.CANCEL]
          : [ORDER_ACTIONS.SUBMIT, ORDER_ACTIONS.CANCEL];
      case "SUBMITTED":
        return [ORDER_ACTIONS.APPROVE, ORDER_ACTIONS.CANCEL];
      case "APPROVED":
      case "IN_FULFILLMENT":
        return [ORDER_ACTIONS.SHIP, ORDER_ACTIONS.CANCEL];
      default:
        return [];
    }
  };

  // Check if user has permission for an action
  const canPerformAction = (action: OrderAction): boolean => {
    switch (action) {
      case ORDER_ACTIONS.SUBMIT:
        return hasPermission(role, "orders", "create") || hasPermission(role, "orders", "update");
      case ORDER_ACTIONS.APPROVE:
        return hasPermission(role, "orders", "approve");
      case ORDER_ACTIONS.SHIP:
        return hasPermission(role, "orders", "ship");
      case ORDER_ACTIONS.CANCEL:
        return hasPermission(role, "orders", "cancel");
      case ORDER_ACTIONS.MARK_REVIEWED:
        return hasPermission(role, "orders", "update") || hasPermission(role, "orders", "approve");
      default:
        return false;
    }
  };

  // Get disabled reason for an action
  const getDisabledReason = (action: OrderAction): string | null => {
    if (!canPerformAction(action)) {
      const requiredRole = action === ORDER_ACTIONS.APPROVE ? "ADMIN" :
                          action === ORDER_ACTIONS.CANCEL ? "ADMIN" :
                          action === ORDER_ACTIONS.SHIP ? "ADMIN or WAREHOUSE" :
                          "ADMIN or REP";
      return `Requires ${requiredRole} role`;
    }

    if (action === ORDER_ACTIONS.SUBMIT && createdByAI && !isReviewed) {
      return "AI order must be reviewed before submission";
    }

    return null;
  };

  // Handle action execution
  const handleAction = async (action: OrderAction, data?: Record<string, unknown>) => {
    setIsLoading(true);
    
    // Set optimistic state
    const previousStatus = currentStatus;
    const previousReviewed = isReviewed;
    
    if (action === ORDER_ACTIONS.SUBMIT) {
      setOptimisticStatus("SUBMITTED");
    } else if (action === ORDER_ACTIONS.APPROVE) {
      setOptimisticStatus("APPROVED");
    } else if (action === ORDER_ACTIONS.SHIP) {
      setOptimisticStatus("SHIPPED");
    } else if (action === ORDER_ACTIONS.CANCEL) {
      setOptimisticStatus("CANCELLED");
    } else if (action === ORDER_ACTIONS.MARK_REVIEWED) {
      setOptimisticReviewed(true);
    }

    try {
      const endpoint = action === ORDER_ACTIONS.MARK_REVIEWED 
        ? `/api/orders/${orderId}/mark-reviewed`
        : `/api/orders/${orderId}/${action}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data || {}),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to ${action} order`);
      }

      const result = await response.json();

      // Show appropriate toast
      if (action === ORDER_ACTIONS.SUBMIT) {
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
      } else if (action === ORDER_ACTIONS.APPROVE && shortages.length > 0) {
        showToast("warning", "Order approved with allocation shortages");
      } else {
        showToast("success", result.message || `Order ${action}d successfully`);
      }

      setActiveModal(null);
      router.refresh();
    } catch (error) {
      // Revert optimistic state
      setOptimisticStatus(previousStatus === status ? null : previousStatus);
      setOptimisticReviewed(previousReviewed === !!aiReviewedAt ? null : previousReviewed);
      
      showToast("error", error instanceof Error ? error.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const availableActions = getAvailableActions();

  if (availableActions.length === 0) {
    return null;
  }

  const getButtonStyles = (action: OrderAction, disabled: boolean): string => {
    const baseStyles = "inline-flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors";
    
    if (disabled) {
      return `${baseStyles} bg-gray-100 text-gray-400 cursor-not-allowed`;
    }

    switch (action) {
      case ORDER_ACTIONS.SUBMIT:
        return `${baseStyles} bg-amber-100 text-amber-800 hover:bg-amber-200`;
      case ORDER_ACTIONS.APPROVE:
        return `${baseStyles} bg-blue-100 text-blue-800 hover:bg-blue-200`;
      case ORDER_ACTIONS.SHIP:
        return `${baseStyles} bg-green-100 text-green-800 hover:bg-green-200`;
      case ORDER_ACTIONS.CANCEL:
        return `${baseStyles} bg-red-100 text-red-800 hover:bg-red-200`;
      case ORDER_ACTIONS.MARK_REVIEWED:
        return `${baseStyles} bg-purple-100 text-purple-800 hover:bg-purple-200`;
      default:
        return `${baseStyles} bg-gray-100 text-gray-800 hover:bg-gray-200`;
    }
  };

  return (
    <>
      {/* AI Badge */}
      {createdByAI && (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mr-2">
          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L10 6.477V16a1 1 0 11-2 0V6.477L4.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 013 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L7 4.323V3a1 1 0 011-1h2z" />
          </svg>
          AI Generated
          {isReviewed && (
            <svg className="w-3 h-3 ml-1 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </span>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {availableActions.map((action) => {
          const disabledReason = getDisabledReason(action);
          const isDisabled = !!disabledReason;

          return (
            <div key={action} className="relative group">
              <button
                onClick={() => !isDisabled && setActiveModal(action)}
                disabled={isDisabled || isLoading}
                className={getButtonStyles(action, isDisabled || isLoading)}
              >
                {ORDER_ACTION_LABELS[action]}
              </button>
              
              {/* Tooltip for disabled buttons */}
              {disabledReason && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {disabledReason}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {activeModal && (
        <OrderActionModal
          isOpen={!!activeModal}
          onClose={() => !isLoading && setActiveModal(null)}
          onConfirm={(data) => handleAction(activeModal, data)}
          action={activeModal}
          orderNumber={orderNumber}
          isLoading={isLoading}
          retailerName={retailerName}
          itemCount={itemCount}
          orderTotal={orderTotal}
          shortages={shortages}
          warningText={
            activeModal === ORDER_ACTIONS.APPROVE && shortages.length > 0
              ? "This order has allocation shortages. Approving will proceed despite insufficient inventory."
              : undefined
          }
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-slide-up ${
            toast.type === "success"
              ? "bg-green-500 text-white"
              : toast.type === "error"
              ? "bg-red-500 text-white"
              : "bg-amber-500 text-white"
          }`}
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
          {toast.type === "warning" && (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
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
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
}

