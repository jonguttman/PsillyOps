'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Tag,
  Plus,
  X,
  Loader2,
  Check,
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  description: string | null;
}

interface Props {
  productId: string;
  currentCategories: Category[];
  allCategories: Category[];
}

export default function ProductCategoriesSection({
  productId,
  currentCategories,
  allCategories,
}: Props) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(currentCategories.map(c => c.id))
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges = () => {
    const currentIds = new Set(currentCategories.map(c => c.id));
    if (selectedIds.size !== currentIds.size) return true;
    for (const id of selectedIds) {
      if (!currentIds.has(id)) return true;
    }
    return false;
  };

  const toggleCategory = (categoryId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(categoryId)) {
      newSelected.delete(categoryId);
    } else {
      newSelected.add(categoryId);
    }
    setSelectedIds(newSelected);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/products/${productId}/categories`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryIds: Array.from(selectedIds),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update categories');
      }

      setShowModal(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async (categoryId: string) => {
    const newCategoryIds = currentCategories
      .filter(c => c.id !== categoryId)
      .map(c => c.id);

    try {
      const res = await fetch(`/api/products/${productId}/categories`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryIds: newCategoryIds,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to remove category');
      }

      router.refresh();
    } catch (err) {
      console.error('Error removing category:', err);
    }
  };

  const openModal = () => {
    setSelectedIds(new Set(currentCategories.map(c => c.id)));
    setError(null);
    setShowModal(true);
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Tag className="w-5 h-5 text-teal-600" />
          <h2 className="text-lg font-medium text-gray-900">Product Categories</h2>
        </div>
        <button
          onClick={openModal}
          className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          <Plus className="w-4 h-4 mr-1" />
          Manage Categories
        </button>
      </div>

      {currentCategories.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
          <Tag className="w-8 h-8 mx-auto text-gray-400 mb-2" />
          <p className="text-gray-500 text-sm">No categories assigned</p>
          <p className="text-gray-400 text-xs mt-1">
            Products without categories won&apos;t appear in the retailer catalog
          </p>
          <button
            onClick={openModal}
            className="mt-3 inline-flex items-center px-3 py-1.5 text-sm font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Categories
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {currentCategories.map((category) => (
            <span
              key={category.id}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full text-sm font-medium group"
            >
              <Tag className="w-3.5 h-3.5" />
              {category.name}
              <button
                onClick={() => handleRemove(category.id)}
                className="ml-1 p-0.5 text-teal-500 hover:text-teal-700 hover:bg-teal-100 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove category"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Category Selection Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Manage Categories</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              {allCategories.length === 0 ? (
                <div className="text-center py-8">
                  <Tag className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-gray-500">No categories available</p>
                  <p className="text-gray-400 text-sm mt-1">
                    Create categories in Settings first
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {allCategories.map((category) => (
                    <label
                      key={category.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedIds.has(category.id)
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-center w-5 h-5 mt-0.5">
                        {selectedIds.has(category.id) ? (
                          <div className="w-5 h-5 bg-teal-500 rounded flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 text-white" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 border-2 border-gray-300 rounded" />
                        )}
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(category.id)}
                        onChange={() => toggleCategory(category.id)}
                        className="sr-only"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{category.name}</div>
                        {category.description && (
                          <div className="text-sm text-gray-500 mt-0.5">
                            {category.description}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
              <span className="text-sm text-gray-500">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !hasChanges()}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
