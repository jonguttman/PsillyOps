'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Package } from 'lucide-react';

interface Material {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
  currentStockQty: number;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure: string;
}

interface Location {
  id: string;
  name: string;
  isDefaultReceiving: boolean;
}

interface Props {
  materials: Material[];
  products: Product[];
  locations: Location[];
}

interface InventoryEntry {
  id: string;
  type: 'MATERIAL' | 'PRODUCT';
  entityId: string;
  quantity: string;
  locationId: string;
  lotNumber: string;
  expiryDate: string;
  unitCost: string;
  notes: string;
}

let entryCounter = 0;

export default function InitialInventoryClient({ materials, products, locations }: Props) {
  const router = useRouter();
  const defaultLocation = locations.find(l => l.isDefaultReceiving) || locations[0];
  
  const [entries, setEntries] = useState<InventoryEntry[]>([
    {
      id: `entry-${entryCounter++}`,
      type: 'MATERIAL',
      entityId: '',
      quantity: '',
      locationId: defaultLocation?.id || '',
      lotNumber: '',
      expiryDate: '',
      unitCost: '',
      notes: ''
    }
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const addEntry = () => {
    setEntries([
      ...entries,
      {
        id: `entry-${entryCounter++}`,
        type: 'MATERIAL',
        entityId: '',
        quantity: '',
        locationId: defaultLocation?.id || '',
        lotNumber: '',
        expiryDate: '',
        unitCost: '',
        notes: ''
      }
    ]);
  };

  const removeEntry = (id: string) => {
    setEntries(entries.filter(e => e.id !== id));
  };

  const updateEntry = (id: string, field: keyof InventoryEntry, value: string) => {
    setEntries(entries.map(e => 
      e.id === id ? { ...e, [field]: value } : e
    ));
  };

  const getEntityInfo = (entry: InventoryEntry) => {
    if (entry.type === 'MATERIAL') {
      return materials.find(m => m.id === entry.entityId);
    } else {
      return products.find(p => p.id === entry.entityId);
    }
  };

  const validate = () => {
    for (const entry of entries) {
      if (!entry.entityId) {
        return 'Please select a material or product for all entries';
      }
      if (!entry.quantity || parseFloat(entry.quantity) <= 0) {
        return 'Please enter a valid quantity greater than 0';
      }
      if (!entry.locationId) {
        return 'Please select a location for all entries';
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/inventory/initial-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to create inventory');
      }

      setSuccess(`✅ Successfully created ${data.created} inventory item(s)!`);
      
      // Reset form
      setEntries([{
        id: `entry-${entryCounter++}`,
        type: 'MATERIAL',
        entityId: '',
        quantity: '',
        locationId: defaultLocation?.id || '',
        lotNumber: '',
        expiryDate: '',
        unitCost: '',
        notes: ''
      }]);

      // Refresh the page data
      router.refresh();

      // Scroll to top to see success message
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">💡 How to Use</h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Select whether you're adding a Material or Product</li>
          <li>Choose the item from the dropdown</li>
          <li>Enter the quantity currently on hand</li>
          <li>Optionally add lot number, expiry date, and unit cost</li>
          <li>Click "Add Another" to create multiple entries at once</li>
          <li>Click "Create Inventory" to save all entries</li>
        </ul>
      </div>

      {/* Entries */}
      <div className="space-y-4">
        {entries.map((entry, index) => {
          const entity = getEntityInfo(entry);
          const availableItems = entry.type === 'MATERIAL' ? materials : products;

          return (
            <div key={entry.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-900">Entry {index + 1}</h3>
                {entries.length > 1 && (
                  <button
                    onClick={() => removeEntry(entry.id)}
                    className="text-gray-400 hover:text-red-600"
                    disabled={submitting}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Type *
                  </label>
                  <select
                    value={entry.type}
                    onChange={(e) => {
                      updateEntry(entry.id, 'type', e.target.value);
                      updateEntry(entry.id, 'entityId', ''); // Reset selection
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={submitting}
                  >
                    <option value="MATERIAL">Material</option>
                    <option value="PRODUCT">Product</option>
                  </select>
                </div>

                {/* Item Selection */}
                <div className="lg:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {entry.type === 'MATERIAL' ? 'Material' : 'Product'} *
                  </label>
                  <select
                    value={entry.entityId}
                    onChange={(e) => updateEntry(entry.id, 'entityId', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={submitting}
                  >
                    <option value="">Select {entry.type === 'MATERIAL' ? 'material' : 'product'}...</option>
                    {availableItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sku} - {item.name} ({item.unitOfMeasure})
                        {entry.type === 'MATERIAL' && (item as Material).currentStockQty > 0 
                          ? ` [Current: ${(item as Material).currentStockQty}]` 
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Quantity * {entity && <span className="text-gray-500">({entity.unitOfMeasure})</span>}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={entry.quantity}
                    onChange={(e) => updateEntry(entry.id, 'quantity', e.target.value)}
                    placeholder="e.g., 100"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={submitting}
                  />
                </div>

                {/* Location */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Location *
                  </label>
                  <select
                    value={entry.locationId}
                    onChange={(e) => updateEntry(entry.id, 'locationId', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={submitting}
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} {loc.isDefaultReceiving && '(Default)'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Unit Cost */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Unit Cost (Optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={entry.unitCost}
                    onChange={(e) => updateEntry(entry.id, 'unitCost', e.target.value)}
                    placeholder="e.g., 12.50"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={submitting}
                  />
                </div>

                {/* Lot Number */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Lot Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={entry.lotNumber}
                    onChange={(e) => updateEntry(entry.id, 'lotNumber', e.target.value)}
                    placeholder="e.g., LOT-2024-001"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={submitting}
                  />
                </div>

                {/* Expiry Date */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Expiry Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={entry.expiryDate}
                    onChange={(e) => updateEntry(entry.id, 'expiryDate', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={submitting}
                  />
                </div>

                {/* Notes */}
                <div className="lg:col-span-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={entry.notes}
                    onChange={(e) => updateEntry(entry.id, 'notes', e.target.value)}
                    placeholder="e.g., Initial stock count from warehouse"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <button
          onClick={addEntry}
          disabled={submitting}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Add Another Entry
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/ops/inventory')}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <Package className="w-4 h-4" />
            {submitting ? 'Creating...' : 'Create Inventory'}
          </button>
        </div>
      </div>
    </div>
  );
}

