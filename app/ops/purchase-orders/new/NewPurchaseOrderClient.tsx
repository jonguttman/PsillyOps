'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, AlertCircle } from 'lucide-react';

interface Vendor {
  id: string;
  name: string;
  defaultLeadTimeDays: number;
}

interface Material {
  id: string;
  name: string;
  sku: string;
  unitOfMeasure: string;
  reorderQuantity: number;
  preferredVendorId: string | null;
}

interface LineItem {
  id: string;
  materialId: string;
  quantityOrdered: number;
  unitCost: number | null;
}

interface Props {
  vendors: Vendor[];
  materials: Material[];
}

export default function NewPurchaseOrderClient({ vendors, materials }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [vendorId, setVendorId] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: '1', materialId: '', quantityOrdered: 0, unitCost: null },
  ]);

  // Filter materials by selected vendor (preferred vendor match)
  const filteredMaterials = vendorId
    ? materials.filter(
        (m) => !m.preferredVendorId || m.preferredVendorId === vendorId
      )
    : materials;

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        id: String(Date.now()),
        materialId: '',
        quantityOrdered: 0,
        unitCost: null,
      },
    ]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((li) => li.id !== id));
    }
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(
      lineItems.map((li) =>
        li.id === id ? { ...li, [field]: value } : li
      )
    );
  };

  const handleMaterialSelect = (lineItemId: string, materialId: string) => {
    const material = materials.find((m) => m.id === materialId);
    setLineItems(
      lineItems.map((li) =>
        li.id === lineItemId
          ? {
              ...li,
              materialId,
              quantityOrdered: material?.reorderQuantity || li.quantityOrdered,
            }
          : li
      )
    );
  };

  const handleVendorChange = (newVendorId: string) => {
    setVendorId(newVendorId);
    
    // Set expected delivery based on vendor lead time
    const vendor = vendors.find((v) => v.id === newVendorId);
    if (vendor && vendor.defaultLeadTimeDays > 0) {
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + vendor.defaultLeadTimeDays);
      setExpectedDeliveryDate(expectedDate.toISOString().split('T')[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    if (!vendorId) {
      setError('Please select a vendor');
      return;
    }
    
    const validLineItems = lineItems.filter(
      (li) => li.materialId && li.quantityOrdered > 0
    );
    
    if (validLineItems.length === 0) {
      setError('Please add at least one line item with a material and quantity');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          expectedDeliveryDate: expectedDeliveryDate || undefined,
          notes: notes || undefined,
          lineItems: validLineItems.map((li) => ({
            materialId: li.materialId,
            quantityOrdered: li.quantityOrdered,
            unitCost: li.unitCost,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create purchase order');
      }

      const data = await res.json();
      router.push(`/purchase-orders/${data.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const totalValue = lineItems.reduce(
    (sum, li) => sum + li.quantityOrdered * (li.unitCost || 0),
    0
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/ops/purchase-orders"
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Purchase Order</h1>
          <p className="text-sm text-gray-600 mt-1">
            Create a draft purchase order for materials.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 mb-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Vendor & Dates */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Order Details</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Vendor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vendor <span className="text-red-500">*</span>
              </label>
              <select
                value={vendorId}
                onChange={(e) => handleVendorChange(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select vendor...</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Expected Delivery */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expected Delivery
              </label>
              <input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes for this order..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Line Items</h2>
            <button
              type="button"
              onClick={addLineItem}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Material
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-32">
                    Quantity
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-32">
                    Unit Cost
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-32">
                    Total
                  </th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lineItems.map((item, index) => {
                  const material = materials.find((m) => m.id === item.materialId);
                  const lineTotal = item.quantityOrdered * (item.unitCost || 0);

                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <select
                          value={item.materialId}
                          onChange={(e) =>
                            handleMaterialSelect(item.id, e.target.value)
                          }
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Select material...</option>
                          {filteredMaterials.map((mat) => (
                            <option key={mat.id} value={mat.id}>
                              {mat.name} ({mat.sku})
                            </option>
                          ))}
                        </select>
                        {material && (
                          <span className="text-xs text-gray-500 mt-1 block">
                            Unit: {material.unitOfMeasure}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={item.quantityOrdered || ''}
                          onChange={(e) =>
                            updateLineItem(
                              item.id,
                              'quantityOrdered',
                              Number(e.target.value) || 0
                            )
                          }
                          placeholder="0"
                          className="w-full px-3 py-2 text-sm text-right border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitCost ?? ''}
                          onChange={(e) =>
                            updateLineItem(
                              item.id,
                              'unitCost',
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                          placeholder="$0.00"
                          className="w-full px-3 py-2 text-sm text-right border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-gray-900">
                          {lineTotal > 0
                            ? lineTotal.toLocaleString('en-US', {
                                style: 'currency',
                                currency: 'USD',
                              })
                            : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(item.id)}
                            className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {totalValue > 0 && (
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-right text-sm font-medium text-gray-700">
                      Estimated Total
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      {totalValue.toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      })}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link
            href="/ops/purchase-orders"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Draft PO'}
          </button>
        </div>
      </form>
    </div>
  );
}


