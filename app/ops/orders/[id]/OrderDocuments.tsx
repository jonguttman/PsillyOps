"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils/formatters";
import TooltipWrapper, { TooltipIcon } from "@/components/ui/TooltipWrapper";

interface Invoice {
  id: string;
  invoiceNo: string;
  issuedAt: Date;
  subtotal: number;
}

interface OrderDocumentsProps {
  orderId: string;
  orderNumber: string;
  hasInvoice: boolean;
  invoice: Invoice | null;
  orderStatus: string;
  userRole?: string;
}

export function OrderDocuments({
  orderId,
  orderNumber,
  hasInvoice,
  invoice,
  orderStatus,
  userRole,
}: OrderDocumentsProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Only allow invoice generation for shipped orders
  const canGenerateInvoice = orderStatus === "SHIPPED" && !hasInvoice;

  const handleGenerateInvoice = async () => {
    setIsGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/invoices/by-order/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to generate invoice");
      }

      const data = await response.json();
      setSuccess(`Invoice ${data.invoiceNo} generated successfully!`);
      
      // Reload the page to show the new invoice
      window.location.reload();
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadInvoice = () => {
    if (invoice) {
      window.open(`/api/invoices/${invoice.id}/pdf`, "_blank");
    }
  };

  const handleDownloadManifest = () => {
    window.open(`/api/orders/${orderId}/manifest`, "_blank");
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4">Documents</h2>

      {/* Feedback messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      <div className="space-y-3">
        {/* Invoice Section */}
        <div className="border-b pb-3">
          <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
            Invoice
            <TooltipWrapper tooltipId="generate-invoice" userRole={userRole} position="bottom">
              <TooltipIcon />
            </TooltipWrapper>
          </h3>
          {hasInvoice && invoice ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{invoice.invoiceNo}</span>
                <span className="text-gray-900 font-medium">
                  {formatCurrency(invoice.subtotal)}
                </span>
              </div>
              <button
                onClick={handleDownloadInvoice}
                className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Download Invoice PDF
              </button>
            </div>
          ) : canGenerateInvoice ? (
            <button
              onClick={handleGenerateInvoice}
              disabled={isGenerating}
              className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Generate Invoice
                </>
              )}
            </button>
          ) : (
            <p className="text-sm text-gray-500 italic">
              {orderStatus === "SHIPPED"
                ? "Invoice already generated"
                : "Invoice can be generated after order is shipped"}
            </p>
          )}
        </div>

        {/* Packing Slip Section */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
            Packing Slip
            <TooltipWrapper tooltipId="download-manifest" userRole={userRole} position="bottom">
              <TooltipIcon />
            </TooltipWrapper>
          </h3>
          <button
            onClick={handleDownloadManifest}
            className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Download Packing Slip
          </button>
        </div>
      </div>
    </div>
  );
}

