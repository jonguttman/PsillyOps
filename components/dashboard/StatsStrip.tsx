interface StatsStripProps {
  lowStockCount: number;
  activeProductionOrders: number;
  openRetailerOrders: number;
  pendingPurchaseOrders: number;
  awaitingInvoiceCount: number;
}

export default function StatsStrip({
  lowStockCount,
  activeProductionOrders,
  openRetailerOrders,
  pendingPurchaseOrders,
  awaitingInvoiceCount,
}: StatsStripProps) {
  const stats = [
    { label: 'Low Stock', value: lowStockCount },
    { label: 'Active Production', value: activeProductionOrders },
    { label: 'Open Orders', value: openRetailerOrders },
    { label: 'Pending POs', value: pendingPurchaseOrders },
    { label: 'Awaiting Invoice', value: awaitingInvoiceCount },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center">
            <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

