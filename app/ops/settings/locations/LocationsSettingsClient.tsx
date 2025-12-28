'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Package,
  Snowflake,
  Factory,
  Truck,
  Archive,
  Check,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Loader2,
  ArrowRightLeft,
  X,
} from 'lucide-react';

// Location types matching the API
const LOCATION_TYPES = [
  { value: 'RACK', label: 'Rack', icon: Archive },
  { value: 'SHELF', label: 'Shelf', icon: Archive },
  { value: 'BIN', label: 'Bin', icon: Package },
  { value: 'COLD_STORAGE', label: 'Cold Storage', icon: Snowflake },
  { value: 'PRODUCTION', label: 'Production Area', icon: Factory },
  { value: 'SHIPPING_RECEIVING', label: 'Shipping/Receiving', icon: Truck },
] as const;

// Types that must be top-level (no parent)
const TOP_LEVEL_ONLY_TYPES = ['RACK', 'COLD_STORAGE', 'PRODUCTION', 'SHIPPING_RECEIVING'];

// Required parent type for each child type
const REQUIRED_PARENT_TYPE: Record<string, string> = {
  SHELF: 'RACK',
  BIN: 'SHELF',
};

// Status badge colors
const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-100 text-green-700',
  RESERVED: 'bg-yellow-100 text-yellow-700',
  QUARANTINED: 'bg-orange-100 text-orange-700',
  DAMAGED: 'bg-red-100 text-red-700',
  SCRAPPED: 'bg-gray-100 text-gray-700',
};

interface ParentLocation {
  id: string;
  name: string;
  type: string;
  path: string;
}

interface Location {
  id: string;
  name: string;
  type: string;
  parentId?: string | null;
  parent?: { id: string; name: string; type: string } | null;
  children?: { id: string; name: string; type: string }[];
  path?: string;
  isDefaultReceiving: boolean;
  isDefaultShipping: boolean;
  active: boolean;
  createdAt: string;
  inventoryCount: number;
}

interface InventoryItem {
  id: string;
  type: 'MATERIAL' | 'PRODUCT';
  itemId: string;
  itemName: string;
  sku: string;
  unit: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  status: string;
  lotNumber: string | null;
  expiryDate: string | null;
  batchCode: string | null;
}

interface Props {
  locations: Location[];
}

export default function LocationsSettingsClient({ locations: initialLocations }: Props) {
  const router = useRouter();
  const [locations, setLocations] = useState(initialLocations);
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [potentialParents, setPotentialParents] = useState<ParentLocation[]>([]);
  const [loadingParents, setLoadingParents] = useState(false);

  // Inline expansion state
  const [expandedLocationId, setExpandedLocationId] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  // Move modal state
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [moveQuantities, setMoveQuantities] = useState<Record<string, number>>({});
  const [moveDestination, setMoveDestination] = useState<string>('');
  const [moveReason, setMoveReason] = useState('');
  const [isMoving, setIsMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'SHELF',
    parentId: '' as string | null,
    isDefaultReceiving: false,
    isDefaultShipping: false,
  });

  // Fetch inventory for a location
  const fetchInventory = useCallback(async (locationId: string) => {
    setLoadingInventory(true);
    setInventoryError(null);
    try {
      const res = await fetch(`/api/locations/${locationId}/inventory`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to fetch inventory');
      }
      const data = await res.json();
      setInventoryItems(data.items || []);
    } catch (err) {
      setInventoryError(err instanceof Error ? err.message : 'Failed to load inventory');
      setInventoryItems([]);
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  // Toggle expansion
  const toggleExpansion = (location: Location) => {
    if (!location.active) return;
    
    if (expandedLocationId === location.id) {
      setExpandedLocationId(null);
      setInventoryItems([]);
      setSelectedItems(new Set());
    } else {
      setExpandedLocationId(location.id);
      setSelectedItems(new Set());
      fetchInventory(location.id);
    }
  };

  // Handle item selection
  const toggleItemSelection = (itemId: string, item: InventoryItem) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
      const newQuantities = { ...moveQuantities };
      delete newQuantities[itemId];
      setMoveQuantities(newQuantities);
    } else {
      newSelected.add(itemId);
      setMoveQuantities((prev) => ({
        ...prev,
        [itemId]: item.quantityAvailable,
      }));
    }
    setSelectedItems(newSelected);
  };

  // Open move modal
  const openMoveModal = () => {
    setMoveDestination('');
    setMoveReason('');
    setMoveError(null);
    setShowMoveModal(true);
  };

  // Close move modal
  const closeMoveModal = () => {
    setShowMoveModal(false);
    setMoveError(null);
  };

  // Execute move
  const handleMove = async () => {
    if (!moveDestination) {
      setMoveError('Please select a destination location');
      return;
    }

    if (moveDestination === expandedLocationId) {
      setMoveError('Destination must be different from source');
      return;
    }

    setIsMoving(true);
    setMoveError(null);

    try {
      const itemsToMove = Array.from(selectedItems);
      
      for (const itemId of itemsToMove) {
        const quantity = moveQuantities[itemId];
        if (!quantity || quantity <= 0) continue;

        const res = await fetch('/api/inventory/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inventoryId: itemId,
            toLocationId: moveDestination,
            quantity,
            reason: moveReason || undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || `Failed to move item`);
        }
      }

      // Success
      setSuccessMessage(`Successfully moved ${itemsToMove.length} item(s)`);
      setTimeout(() => setSuccessMessage(null), 3000);
      
      closeMoveModal();
      setSelectedItems(new Set());
      setMoveQuantities({});
      
      // Refresh inventory
      if (expandedLocationId) {
        fetchInventory(expandedLocationId);
      }
      
      // Refresh locations to update counts
      router.refresh();
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setIsMoving(false);
    }
  };

  // Fetch potential parents when type changes
  const fetchPotentialParents = useCallback(async (type: string) => {
    if (TOP_LEVEL_ONLY_TYPES.includes(type)) {
      setPotentialParents([]);
      return;
    }

    setLoadingParents(true);
    try {
      const res = await fetch(`/api/locations?forParentType=${type}`);
      if (res.ok) {
        const parents = await res.json();
        setPotentialParents(parents);
      }
    } catch (err) {
      console.error('Failed to fetch potential parents:', err);
    } finally {
      setLoadingParents(false);
    }
  }, []);

  const requiresParent = (type: string): boolean => {
    return !!REQUIRED_PARENT_TYPE[type];
  };

  const canHaveParent = (type: string): boolean => {
    return !TOP_LEVEL_ONLY_TYPES.includes(type);
  };

  const openCreateModal = () => {
    setEditingLocation(null);
    setFormData({
      name: '',
      type: 'SHELF',
      parentId: null,
      isDefaultReceiving: false,
      isDefaultShipping: false,
    });
    setError(null);
    setShowModal(true);
    fetchPotentialParents('SHELF');
  };

  const openEditModal = (location: Location, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingLocation(location);
    setFormData({
      name: location.name,
      type: location.type,
      parentId: location.parentId || null,
      isDefaultReceiving: location.isDefaultReceiving,
      isDefaultShipping: location.isDefaultShipping,
    });
    setError(null);
    setShowModal(true);
    fetchPotentialParents(location.type);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingLocation(null);
    setError(null);
    setPotentialParents([]);
  };

  const handleTypeChange = (newType: string) => {
    setFormData((prev) => ({
      ...prev,
      type: newType,
      parentId: TOP_LEVEL_ONLY_TYPES.includes(newType) ? null : prev.parentId,
    }));
    fetchPotentialParents(newType);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (requiresParent(formData.type) && !formData.parentId) {
      setError(`${formData.type} requires a parent ${REQUIRED_PARENT_TYPE[formData.type]}.`);
      setIsSubmitting(false);
      return;
    }

    try {
      const url = editingLocation
        ? `/api/locations/${editingLocation.id}`
        : '/api/locations';
      const method = editingLocation ? 'PUT' : 'POST';

      const payload = {
        ...formData,
        parentId: formData.parentId || null,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to save location');
      }

      closeModal();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (location: Location, e: React.MouseEvent) => {
    e.stopPropagation();
    const childCount = location.children?.length || 0;
    if (childCount > 0) {
      alert(`Cannot deactivate "${location.name}" because it has ${childCount} active child location(s). Deactivate children first.`);
      return;
    }

    if (!confirm(`Are you sure you want to deactivate "${location.name}"?${location.inventoryCount > 0 ? ` This location has ${location.inventoryCount} inventory items.` : ''}`)) {
      return;
    }

    try {
      const res = await fetch(`/api/locations/${location.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to delete location');
      }

      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleReactivate = async (location: Location) => {
    try {
      const res = await fetch(`/api/locations/${location.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to reactivate location');
      }

      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const getTypeInfo = (type: string) => {
    return LOCATION_TYPES.find((t) => t.value === type) || { label: type, icon: MapPin };
  };

  const getHierarchyDepth = (location: Location): number => {
    if (!location.path) return 0;
    const parts = location.path.split(' → ');
    return parts.length - 1;
  };

  const sortedActiveLocations = [...locations]
    .filter((l) => l.active)
    .sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name));

  const inactiveLocations = locations.filter((l) => !l.active);

  // Get active locations for move destination (excluding current)
  const availableDestinations = sortedActiveLocations.filter(
    (l) => l.id !== expandedLocationId
  );

  return (
    <div className="space-y-6">
      {/* Success Toast */}
      {successMessage && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <Check className="w-5 h-5" />
          {successMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/ops/settings"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <MapPin className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Locations</h1>
              <p className="text-sm text-gray-600">
                Manage storage locations for inventory
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Location
        </button>
      </div>

      {/* Active Locations Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Active Locations ({sortedActiveLocations.length})
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Click a row to view inventory
          </p>
        </div>

        {sortedActiveLocations.length === 0 ? (
          <div className="p-8 text-center">
            <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No locations configured yet.</p>
            <p className="text-sm text-gray-400 mt-1">
              Add your first location to start organizing inventory.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Default Receiving
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Default Shipping
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Inventory Items
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedActiveLocations.map((location) => {
                  const typeInfo = getTypeInfo(location.type);
                  const TypeIcon = typeInfo.icon;
                  const depth = getHierarchyDepth(location);
                  const hasChildren = (location.children?.length || 0) > 0;
                  const isExpanded = expandedLocationId === location.id;

                  return (
                    <>
                      <tr
                        key={location.id}
                        onClick={() => toggleExpansion(location)}
                        className={`hover:bg-gray-50 cursor-pointer ${
                          isExpanded ? 'bg-blue-50' : ''
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div
                            className="flex items-center gap-2"
                            style={{ paddingLeft: `${depth * 24}px` }}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-blue-600 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            )}
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-900">
                                {location.name}
                              </span>
                              {location.path && depth > 0 && (
                                <span className="text-xs text-gray-400">
                                  {location.path}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <TypeIcon className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-600">
                              {typeInfo.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {location.isDefaultReceiving ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                              <Check className="w-3 h-3" />
                              Default
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {location.isDefaultShipping ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                              <Check className="w-3 h-3" />
                              Default
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-sm text-gray-600">
                            {location.inventoryCount}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => openEditModal(location, e)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => handleDelete(location, e)}
                              className={`p-1.5 rounded transition-colors ${
                                hasChildren
                                  ? 'text-gray-300 cursor-not-allowed'
                                  : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                              }`}
                              title={hasChildren ? 'Cannot deactivate: has children' : 'Deactivate'}
                              disabled={hasChildren}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Inline Expansion - Inventory */}
                      {isExpanded && (
                        <tr key={`${location.id}-inventory`}>
                          <td colSpan={6} className="px-0 py-0">
                            <div className="bg-gray-50 border-t border-b border-gray-200 px-6 py-4">
                              {loadingInventory ? (
                                <div className="flex items-center justify-center py-8">
                                  <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                                  <span className="ml-2 text-gray-600">Loading inventory...</span>
                                </div>
                              ) : inventoryError ? (
                                <div className="flex items-center justify-center py-8 text-red-600">
                                  <AlertCircle className="w-5 h-5 mr-2" />
                                  {inventoryError}
                                </div>
                              ) : inventoryItems.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                  <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                  No inventory at this location
                                </div>
                              ) : (
                                <>
                                  {/* Move Selected Button */}
                                  <div className="flex items-center justify-between mb-4">
                                    <span className="text-sm font-medium text-gray-700">
                                      Inventory Items ({inventoryItems.length})
                                    </span>
                                    <button
                                      onClick={openMoveModal}
                                      disabled={selectedItems.size === 0}
                                      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                                        selectedItems.size > 0
                                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                      }`}
                                    >
                                      <ArrowRightLeft className="w-4 h-4" />
                                      Move Selected ({selectedItems.size})
                                    </button>
                                  </div>

                                  {/* Inventory Table */}
                                  <table className="w-full bg-white rounded-lg overflow-hidden">
                                    <thead className="bg-gray-100">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-10">
                                          <span className="sr-only">Select</span>
                                        </th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                          Item
                                        </th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                          Type
                                        </th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                          SKU
                                        </th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                          Qty
                                        </th>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                          Status
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {inventoryItems.map((item) => (
                                        <tr
                                          key={item.id}
                                          className={`${
                                            selectedItems.has(item.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                                          }`}
                                        >
                                          <td className="px-3 py-2">
                                            <input
                                              type="checkbox"
                                              checked={selectedItems.has(item.id)}
                                              onChange={() => toggleItemSelection(item.id, item)}
                                              disabled={item.quantityAvailable <= 0}
                                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                                            />
                                          </td>
                                          <td className="px-3 py-2">
                                            <Link
                                              href={`/ops/${item.type === 'MATERIAL' ? 'materials' : 'products'}/${item.itemId}`}
                                              onClick={(e) => e.stopPropagation()}
                                              className="text-sm font-medium text-blue-600 hover:text-blue-800"
                                            >
                                              {item.itemName}
                                            </Link>
                                            {item.lotNumber && (
                                              <span className="block text-xs text-gray-400">
                                                Lot: {item.lotNumber}
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                              item.type === 'MATERIAL'
                                                ? 'bg-purple-100 text-purple-700'
                                                : 'bg-teal-100 text-teal-700'
                                            }`}>
                                              {item.type === 'MATERIAL' ? 'Material' : 'Product'}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2 text-sm text-gray-600">
                                            {item.sku}
                                          </td>
                                          <td className="px-3 py-2 text-right">
                                            <span className="text-sm font-medium text-gray-900">
                                              {item.quantityOnHand}
                                            </span>
                                            <span className="text-xs text-gray-500 ml-1">
                                              {item.unit}
                                            </span>
                                            {item.quantityReserved > 0 && (
                                              <span className="block text-xs text-yellow-600">
                                                ({item.quantityReserved} reserved)
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                              STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-700'
                                            }`}>
                                              {item.status}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inactive Locations */}
      {inactiveLocations.length > 0 && (
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-500">
              Inactive Locations ({inactiveLocations.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Inventory Items
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {inactiveLocations.map((location) => {
                  const typeInfo = getTypeInfo(location.type);
                  return (
                    <tr key={location.id} className="bg-gray-50 opacity-60">
                      <td className="px-6 py-4">
                        <span className="font-medium text-gray-600">
                          {location.name}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-500">
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm text-gray-500">
                          {location.inventoryCount}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleReactivate(location)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          Reactivate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Move Inventory
              </h2>
              <button
                onClick={closeMoveModal}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {moveError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {moveError}
                </div>
              )}

              {/* Items to move */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Items to Move ({selectedItems.size})
                </label>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                  {inventoryItems
                    .filter((item) => selectedItems.has(item.id))
                    .map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-0"
                      >
                        <div>
                          <span className="text-sm font-medium text-gray-900">
                            {item.itemName}
                          </span>
                          <span className="text-xs text-gray-500 ml-2">
                            ({item.sku})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={item.quantityAvailable}
                            value={moveQuantities[item.id] || 0}
                            onChange={(e) =>
                              setMoveQuantities((prev) => ({
                                ...prev,
                                [item.id]: Math.min(
                                  Math.max(1, parseInt(e.target.value) || 0),
                                  item.quantityAvailable
                                ),
                              }))
                            }
                            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                          />
                          <span className="text-xs text-gray-500">
                            / {item.quantityAvailable} {item.unit}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Destination */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Destination Location <span className="text-red-500">*</span>
                </label>
                <select
                  value={moveDestination}
                  onChange={(e) => setMoveDestination(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  <option value="">Select destination...</option>
                  {availableDestinations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.path || loc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  placeholder="e.g., Reorganizing warehouse"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeMoveModal}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={isMoving}
              >
                Cancel
              </button>
              <button
                onClick={handleMove}
                disabled={isMoving || !moveDestination}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isMoving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Moving...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="w-4 h-4" />
                    Move Items
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Location Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingLocation ? 'Edit Location' : 'Add Location'}
              </h2>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location Name / Code
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., RACK-01, SHELF-A1, Cold Storage 1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Use a code format like RACK-01 or a descriptive name
                  </p>
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {LOCATION_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Parent Location */}
                {canHaveParent(formData.type) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Parent Location
                      {requiresParent(formData.type) && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </label>
                    <select
                      value={formData.parentId || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          parentId: e.target.value || null,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required={requiresParent(formData.type)}
                      disabled={loadingParents}
                    >
                      <option value="">
                        {loadingParents
                          ? 'Loading...'
                          : requiresParent(formData.type)
                          ? `Select a ${REQUIRED_PARENT_TYPE[formData.type]}...`
                          : '(No parent)'}
                      </option>
                      {potentialParents.map((parent) => (
                        <option key={parent.id} value={parent.id}>
                          {parent.path || parent.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      {formData.type === 'SHELF'
                        ? 'Shelves must be placed inside a Rack'
                        : formData.type === 'BIN'
                        ? 'Bins must be placed on a Shelf'
                        : 'Optional parent location'}
                    </p>
                    {potentialParents.length === 0 &&
                      !loadingParents &&
                      requiresParent(formData.type) && (
                        <p className="mt-1 text-xs text-amber-600">
                          No {REQUIRED_PARENT_TYPE[formData.type]} locations found. Create one first.
                        </p>
                      )}
                  </div>
                )}

                {/* Default Checkboxes */}
                <div className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formData.isDefaultReceiving}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isDefaultReceiving: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        Default Receiving Location
                      </span>
                      <p className="text-xs text-gray-500">
                        Auto-selected when receiving purchase orders
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formData.isDefaultShipping}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isDefaultShipping: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        Default Shipping Location
                      </span>
                      <p className="text-xs text-gray-500">
                        Auto-selected when shipping orders
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || (requiresParent(formData.type) && potentialParents.length === 0)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isSubmitting
                    ? 'Saving...'
                    : editingLocation
                    ? 'Save Changes'
                    : 'Add Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
