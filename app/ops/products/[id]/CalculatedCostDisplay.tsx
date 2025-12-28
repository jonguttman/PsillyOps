'use client';

import { useState } from 'react';
import { AlertCircle, Calculator, X } from 'lucide-react';

interface BomBreakdownItem {
  materialId: string;
  materialName: string;
  quantityPerUnit: number;
  unitCost: number;
  totalCost: number;
}

interface CalculatedCostDisplayProps {
  totalCostPerUnit: number;
  bomBreakdown: BomBreakdownItem[];
  hasBom: boolean;
}

export default function CalculatedCostDisplay({
  totalCostPerUnit,
  bomBreakdown,
  hasBom,
}: CalculatedCostDisplayProps) {
  const [showModal, setShowModal] = useState(false);

  // Find materials with missing costs (unitCost === 0)
  const missingCostMaterials = bomBreakdown.filter((item) => item.unitCost === 0);
  const hasMissingCosts = missingCostMaterials.length > 0;

  if (!hasBom) {
    return (
      <div>
        <dt className="text-sm font-medium text-gray-500">Calculated Cost</dt>
        <dd className="mt-1 text-sm text-gray-400">No BOM configured</dd>
      </div>
    );
  }

  return (
    <div>
      <dt className="text-sm font-medium text-gray-500 flex items-center gap-1">
        <Calculator className="w-3.5 h-3.5" />
        Calculated Cost
      </dt>
      <dd className="mt-1">
        <button
          onClick={() => setShowModal(true)}
          className={`text-sm font-semibold flex items-center gap-1.5 hover:underline ${
            hasMissingCosts ? 'text-amber-600' : 'text-gray-900'
          }`}
        >
          ${totalCostPerUnit.toFixed(2)}
          {hasMissingCosts && (
            <AlertCircle className="w-4 h-4 text-amber-500" />
          )}
        </button>
      </dd>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Cost Breakdown
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {hasMissingCosts && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        Missing Material Costs
                      </p>
                      <p className="text-sm text-amber-700 mt-1">
                        The following materials have no purchase history and are not included in the cost calculation:
                      </p>
                      <ul className="mt-2 space-y-1">
                        {missingCostMaterials.map((item) => (
                          <li
                            key={item.materialId}
                            className="text-sm text-amber-700"
                          >
                            • {item.materialName} ({item.quantityPerUnit} per unit)
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase pb-2">
                      Material
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">
                      Qty/Unit
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">
                      Unit Cost
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase pb-2">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bomBreakdown.map((item) => (
                    <tr
                      key={item.materialId}
                      className={item.unitCost === 0 ? 'text-amber-600' : ''}
                    >
                      <td className="py-2 text-sm">
                        {item.materialName}
                        {item.unitCost === 0 && (
                          <span className="ml-1 text-xs">(no cost data)</span>
                        )}
                      </td>
                      <td className="py-2 text-sm text-right">
                        {item.quantityPerUnit}
                      </td>
                      <td className="py-2 text-sm text-right">
                        {item.unitCost > 0 ? `$${item.unitCost.toFixed(4)}` : '—'}
                      </td>
                      <td className="py-2 text-sm text-right font-medium">
                        {item.totalCost > 0 ? `$${item.totalCost.toFixed(4)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-gray-200">
                  <tr>
                    <td
                      colSpan={3}
                      className="py-3 text-sm font-medium text-gray-700 text-right"
                    >
                      Total Material Cost per Unit
                    </td>
                    <td className="py-3 text-sm font-bold text-gray-900 text-right">
                      ${totalCostPerUnit.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              <p className="mt-4 text-xs text-gray-500">
                Costs are calculated using the most recent purchase order prices for each material.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

