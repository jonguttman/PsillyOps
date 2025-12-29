import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { formatDate, formatCurrency } from "@/lib/utils/formatters";
import { OrderDocuments } from "./OrderDocuments";
import { OrderActions } from "./OrderActions";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  SUBMITTED: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-blue-100 text-blue-800",
  IN_FULFILLMENT: "bg-purple-100 text-purple-800",
  SHIPPED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();

  if (!session || !session.user) {
    redirect("/login");
  }

  if (session.user.role === "REP") {
    redirect("/");
  }

  const { id } = await params;

  const order = await prisma.retailerOrder.findUnique({
    where: { id },
    include: {
      retailer: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      approvedBy: {
        select: { id: true, name: true },
      },
      lineItems: {
        include: {
          product: true,
        },
      },
      invoices: true,
    },
  });

  if (!order) {
    notFound();
  }

  // Calculate order totals
  const orderSubtotal = order.lineItems.reduce((sum, item) => {
    if (item.lineTotal !== null) {
      return sum + item.lineTotal;
    }
    const price = item.unitWholesalePrice ?? item.product.wholesalePrice ?? 0;
    return sum + price * item.quantityOrdered;
  }, 0);

  const totalItems = order.lineItems.reduce(
    (sum, item) => sum + item.quantityOrdered,
    0
  );

  const totalAllocated = order.lineItems.reduce(
    (sum, item) => sum + item.quantityAllocated,
    0
  );

  const hasInvoice = order.invoices.length > 0;
  const invoice = hasInvoice ? order.invoices[0] : null;

  // Calculate shortages for OrderActions component
  const shortages = order.lineItems
    .filter((item) => item.quantityAllocated < item.quantityOrdered)
    .map((item) => ({
      productName: item.product.name,
      shortage: item.quantityOrdered - item.quantityAllocated,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              Order {order.orderNumber}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                STATUS_STYLES[order.status] || "bg-gray-100 text-gray-800"
              }`}
            >
              {order.status.replace("_", " ")}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            For {order.retailer.name} • Created {formatDate(order.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <OrderActions
            orderId={order.id}
            orderNumber={order.orderNumber}
            status={order.status}
            userRole={session.user.role}
            createdByAI={order.createdByAI}
            aiReviewedAt={order.aiReviewedAt}
            retailerName={order.retailer.name}
            itemCount={totalItems}
            orderTotal={orderSubtotal}
            shortages={shortages}
          />
          <Link
            href="/ops/orders"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            &larr; Back to Orders
          </Link>
        </div>
      </div>

      {/* Order Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white shadow rounded-lg p-5">
          <h3 className="text-sm font-medium text-gray-500">Order Total</h3>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {formatCurrency(orderSubtotal)}
          </p>
          <p className="text-sm text-gray-500">{totalItems} items</p>
        </div>
        <div className="bg-white shadow rounded-lg p-5">
          <h3 className="text-sm font-medium text-gray-500">Allocation</h3>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {totalAllocated} / {totalItems}
          </p>
          <p className="text-sm text-gray-500">
            {totalAllocated === totalItems
              ? "Fully allocated"
              : "Partial allocation"}
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-5">
          <h3 className="text-sm font-medium text-gray-500">Invoice</h3>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {hasInvoice ? invoice?.invoiceNo : "—"}
          </p>
          <p className="text-sm text-gray-500">
            {hasInvoice
              ? `Issued ${formatDate(invoice?.issuedAt)}`
              : "Not invoiced"}
          </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Details - Main Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Line Items */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Order Items
            </h2>
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                    Product
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                    Qty
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                    Allocated
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                    Unit Price
                  </th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.lineItems.map((item) => {
                  const unitPrice =
                    item.unitWholesalePrice ??
                    item.product.wholesalePrice ??
                    0;
                  const lineTotal =
                    item.lineTotal ?? unitPrice * item.quantityOrdered;
                  const hasShortage =
                    item.quantityAllocated < item.quantityOrdered;

                  return (
                    <tr key={item.id}>
                      <td className="py-3">
                        <div className="text-sm font-medium text-gray-900">
                          {item.product.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {item.product.sku}
                        </div>
                      </td>
                      <td className="py-3 text-sm text-gray-900 text-right">
                        {item.quantityOrdered}
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className={`text-sm ${
                            hasShortage ? "text-amber-600 font-medium" : "text-gray-900"
                          }`}
                        >
                          {item.quantityAllocated}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-gray-900 text-right">
                        {formatCurrency(unitPrice)}
                      </td>
                      <td className="py-3 text-sm font-medium text-gray-900 text-right">
                        {formatCurrency(lineTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td
                    colSpan={4}
                    className="py-3 text-sm font-medium text-gray-900 text-right"
                  >
                    Subtotal
                  </td>
                  <td className="py-3 text-sm font-bold text-gray-900 text-right">
                    {formatCurrency(orderSubtotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Order Timeline */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Timeline</h2>
            <div className="flow-root">
              <ul className="-mb-8">
                <li className="relative pb-8">
                  <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" />
                  <div className="relative flex space-x-3">
                    <div>
                      <span className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center ring-8 ring-white">
                        <svg
                          className="h-4 w-4 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 pt-1.5">
                      <p className="text-sm text-gray-900">
                        Order created by{" "}
                        <span className="font-medium">{order.createdBy.name}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                  </div>
                </li>
                {order.approvedAt && (
                  <li className="relative pb-8">
                    <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" />
                    <div className="relative flex space-x-3">
                      <div>
                        <span className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center ring-8 ring-white">
                          <svg
                            className="h-4 w-4 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 pt-1.5">
                        <p className="text-sm text-gray-900">
                          Order approved by{" "}
                          <span className="font-medium">
                            {order.approvedBy?.name || "Admin"}
                          </span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDate(order.approvedAt)}
                        </p>
                      </div>
                    </div>
                  </li>
                )}
                {order.shippedAt && (
                  <li className="relative pb-8">
                    <div className="relative flex space-x-3">
                      <div>
                        <span className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center ring-8 ring-white">
                          <svg
                            className="h-4 w-4 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 pt-1.5">
                        <p className="text-sm text-gray-900">Order shipped</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(order.shippedAt)}
                          {order.trackingNumber && (
                            <span className="ml-2 text-blue-600">
                              Tracking: {order.trackingNumber}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </li>
                )}
                {hasInvoice && (
                  <li className="relative">
                    <div className="relative flex space-x-3">
                      <div>
                        <span className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center ring-8 ring-white">
                          <svg
                            className="h-4 w-4 text-white"
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
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 pt-1.5">
                        <p className="text-sm text-gray-900">
                          Invoice {invoice?.invoiceNo} generated
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDate(invoice?.issuedAt)}
                        </p>
                      </div>
                    </div>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Retailer Info */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Retailer
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">Name</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {order.retailer.name}
                </dd>
              </div>
              {order.retailer.contactEmail && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Email</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {order.retailer.contactEmail}
                  </dd>
                </div>
              )}
              {order.retailer.contactPhone && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Phone</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {order.retailer.contactPhone}
                  </dd>
                </div>
              )}
              {order.retailer.shippingAddress && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    Shipping Address
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 whitespace-pre-line">
                    {order.retailer.shippingAddress}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Documents Section */}
          <OrderDocuments 
            orderId={id} 
            orderNumber={order.orderNumber}
            hasInvoice={hasInvoice} 
            invoice={invoice}
            orderStatus={order.status}
            userRole={session.user.role}
          />

          {/* Order Details */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Order Details
            </h2>
            <dl className="space-y-3">
              {order.requestedShipDate && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    Requested Ship Date
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formatDate(order.requestedShipDate)}
                  </dd>
                </div>
              )}
              {order.trackingNumber && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    Tracking Number
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {order.trackingNumber}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Last Updated
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatDate(order.updatedAt)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}


