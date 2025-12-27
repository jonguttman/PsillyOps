'use client';

import { useState, useEffect, useCallback } from 'react';
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

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'SHELF',
    parentId: '' as string | null,
    isDefaultReceiving: false,
    isDefaultShipping: false,
  });

  // Fetch potential parents when type changes
  const fetchPotentialParents = useCallback(async (type: string) => {
    // Top-level types don't have parents
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

  // Check if type requires a parent
  const requiresParent = (type: string): boolean => {
    return !!REQUIRED_PARENT_TYPE[type];
  };

  // Check if type can have a parent
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

  const openEditModal = (location: Location) => {
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

    // Client-side validation for required parent
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

  const handleDelete = async (location: Location) => {
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

  // Calculate hierarchy depth for indentation
  const getHierarchyDepth = (location: Location): number => {
    if (!location.path) return 0;
    const parts = location.path.split(' → ');
    return parts.length - 1;
  };

  // Sort locations by hierarchy path for proper display
  const sortedActiveLocations = [...locations]
    .filter((l) => l.active)
    .sort((a, b) => (a.path || a.name).localeCompare(b.path || b.name));

  const inactiveLocations = locations.filter((l) => !l.active);

  return (
    <div className="space-y-6">
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
                  
                  return (
                    <tr key={location.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div
                          className="flex items-center gap-2"
                          style={{ paddingLeft: `${depth * 24}px` }}
                        >
                          {/* Hierarchy indicator */}
                          {depth > 0 && (
                            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                          )}
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900">
                              {location.name}
                            </span>
                            {/* Breadcrumb path for nested items */}
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
                            onClick={() => openEditModal(location)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(location)}
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

      {/* Create/Edit Modal */}
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

                {/* Parent Location - Only show for types that can have parents */}
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
