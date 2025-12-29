"use client";

import { useState } from "react";
import { ORDER_ACTIONS, ORDER_ACTION_LABELS, type OrderAction } from "@/lib/constants/orderActions";

interface OrderActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data?: Record<string, unknown>) => Promise<void>;
  action: OrderAction;
  orderNumber: string;
  isLoading: boolean;
  // Action-specific props
  warningText?: string;
  retailerName?: string;
  itemCount?: number;
  orderTotal?: number;
  shortages?: Array<{ productName: string; shortage: number }>;
}

const ACTION_CONFIGS: Record<OrderAction, {
  title: string;
  description: string;
  confirmText: string;
  confirmColor: string;
  icon: string;
}> = {
  [ORDER_ACTIONS.SUBMIT]: {
    title: "Submit Order",
    description: "This will allocate inventory, snapshot prices, and move the order to SUBMITTED status.",
    confirmText: "Submit Order",
    confirmColor: "bg-amber-600 hover:bg-amber-700",
    icon: "📤",
  },
  [ORDER_ACTIONS.APPROVE]: {
    title: "Approve Order",
    description: "This will approve the order and prepare it for fulfillment.",
    confirmText: "Approve Order",
    confirmColor: "bg-blue-600 hover:bg-blue-700",
    icon: "✅",
  },
  [ORDER_ACTIONS.SHIP]: {
    title: "Ship Order",
    description: "This will mark the order as shipped and deduct allocated inventory.",
    confirmText: "Ship Order",
    confirmColor: "bg-green-600 hover:bg-green-700",
    icon: "📦",
  },
  [ORDER_ACTIONS.CANCEL]: {
    title: "Cancel Order",
    description: "This will cancel the order and release any allocated inventory.",
    confirmText: "Cancel Order",
    confirmColor: "bg-red-600 hover:bg-red-700",
    icon: "❌",
  },
  [ORDER_ACTIONS.MARK_REVIEWED]: {
    title: "Mark as Reviewed",
    description: "Confirm that you have reviewed this AI-generated order and it is ready for submission.",
    confirmText: "Mark as Reviewed",
    confirmColor: "bg-purple-600 hover:bg-purple-700",
    icon: "🔍",
  },
};

export function OrderActionModal({
  isOpen,
  onClose,
  onConfirm,
  action,
  orderNumber,
  isLoading,
  warningText,
  retailerName,
  itemCount,
  orderTotal,
  shortages,
}: OrderActionModalProps) {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [reviewChecked, setReviewChecked] = useState({
    quantities: false,
    products: false,
    retailer: false,
  });

  if (!isOpen) return null;

  const config = ACTION_CONFIGS[action];

  const handleConfirm = async () => {
    const data: Record<string, unknown> = {};
    
    if (action === ORDER_ACTIONS.SHIP && trackingNumber) {
      data.trackingNumber = trackingNumber;
    }
    
    if (action === ORDER_ACTIONS.CANCEL && cancelReason) {
      data.reason = cancelReason;
    }

    await onConfirm(data);
  };

  const isReviewComplete = action !== ORDER_ACTIONS.MARK_REVIEWED || 
    (reviewChecked.quantities && reviewChecked.products && reviewChecked.retailer);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{config.icon}</span>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{config.title}</h3>
              <p className="text-sm text-gray-500">Order {orderNumber}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600">{config.description}</p>

          {/* Order Summary for Submit */}
          {action === ORDER_ACTIONS.SUBMIT && retailerName && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Retailer</span>
                <span className="font-medium text-gray-900">{retailerName}</span>
              </div>
              {itemCount !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Items</span>
                  <span className="font-medium text-gray-900">{itemCount}</span>
                </div>
              )}
              {orderTotal !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total</span>
                  <span className="font-medium text-gray-900">{formatCurrency(orderTotal)}</span>
                </div>
              )}
            </div>
          )}

          {/* Warning Text */}
          {warningText && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">⚠️</span>
                <p className="text-sm text-amber-800">{warningText}</p>
              </div>
            </div>
          )}

          {/* Shortages Warning for Approve */}
          {action === ORDER_ACTIONS.APPROVE && shortages && shortages.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">⚠️</span>
                <div>
                  <p className="text-sm font-medium text-amber-800">Allocation Shortages</p>
                  <p className="text-xs text-amber-700 mt-1">
                    The following items have insufficient inventory:
                  </p>
                  <ul className="mt-2 space-y-1">
                    {shortages.map((s, i) => (
                      <li key={i} className="text-xs text-amber-700">
                        • {s.productName}: {s.shortage} units short
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Tracking Number Input for Ship */}
          {action === ORDER_ACTIONS.SHIP && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tracking Number <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Enter tracking number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                disabled={isLoading}
              />
            </div>
          )}

          {/* Cancel Reason for Cancel */}
          {action === ORDER_ACTIONS.CANCEL && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for Cancellation <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter reason for cancellation"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                disabled={isLoading}
              />
            </div>
          )}

          {/* Review Checklist for Mark Reviewed */}
          {action === ORDER_ACTIONS.MARK_REVIEWED && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Please confirm you have reviewed:</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewChecked.quantities}
                  onChange={(e) => setReviewChecked(prev => ({ ...prev, quantities: e.target.checked }))}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  disabled={isLoading}
                />
                <span className="text-sm text-gray-600">All quantities are correct</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewChecked.products}
                  onChange={(e) => setReviewChecked(prev => ({ ...prev, products: e.target.checked }))}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  disabled={isLoading}
                />
                <span className="text-sm text-gray-600">All products are correctly identified</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewChecked.retailer}
                  onChange={(e) => setReviewChecked(prev => ({ ...prev, retailer: e.target.checked }))}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                  disabled={isLoading}
                />
                <span className="text-sm text-gray-600">The retailer is correct</span>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || !isReviewComplete}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${config.confirmColor}`}
          >
            {isLoading && (
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {isLoading ? "Processing..." : config.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

