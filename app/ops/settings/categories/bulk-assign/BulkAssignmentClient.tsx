'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Tag,
  Package,
  Search,
  Check,
  Loader2,
  AlertTriangle,
  X,
} from 'lucide-react';

interface Strain {
  id: string;
  name: string;
  shortCode: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  strainId: string | null;
  strain: Strain | null;
  categoryIds: string[];
}

interface Category {
  id: string;
  name: string;
  description: string | null;
  productCount: number;
}

interface Props {
  products: Product[];
  categories: Category[];
  strains: Strain[];
}

export default function BulkAssignmentClient({ products, categories, strains }: Props) {
  const router = useRouter();

  // Selection state
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());

  // Filters
  const [productSearch, setProductSearch] = useState('');
  const [strainFilter, setStrainFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'uncategorized' | 'categorized'>('all');

  // Assignment mode
  const [assignMode, setAssignMode] = useState<'add' | 'replace'>('add');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Search filter
      const matchesSearch = productSearch === '' ||
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(productSearch.toLowerCase());

      // Strain filter
      const matchesStrain = strainFilter === '' || p.strainId === strainFilter;

      // Category filter
      let matchesCategory = true;
      if (categoryFilter === 'uncategorized') {
        matchesCategory = p.categoryIds.length === 0;
      } else if (categoryFilter === 'categorized') {
        matchesCategory = p.categoryIds.length > 0;
      }

      return matchesSearch && matchesStrain && matchesCategory;
    });
  }, [products, productSearch, strainFilter, categoryFilter]);

  // Stats
  const uncategorizedCount = products.filter(p => p.categoryIds.length === 0).length;

  // Toggle product selection
  const toggleProduct = (productId: string) => {
    const newSelected = new Set(selectedProductIds);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProductIds(newSelected);
  };

  // Select/deselect all visible products
  const toggleAllProducts = () => {
    if (filteredProducts.every(p => selectedProductIds.has(p.id))) {
      // Deselect all visible
      const newSelected = new Set(selectedProductIds);
      filteredProducts.forEach(p => newSelected.delete(p.id));
      setSelectedProductIds(newSelected);
    } else {
      // Select all visible
      const newSelected = new Set(selectedProductIds);
      filteredProducts.forEach(p => newSelected.add(p.id));
      setSelectedProductIds(newSelected);
    }
  };

  // Toggle category selection
  const toggleCategory = (categoryId: string) => {
    const newSelected = new Set(selectedCategoryIds);
    if (newSelected.has(categoryId)) {
      newSelected.delete(categoryId);
    } else {
      newSelected.add(categoryId);
    }
    setSelectedCategoryIds(newSelected);
  };

  // Handle assignment
  const handleAssign = async () => {
    if (selectedProductIds.size === 0 || selectedCategoryIds.size === 0) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const assignments = Array.from(selectedProductIds).map(productId => ({
        productId,
        categoryIds: Array.from(selectedCategoryIds),
      }));

      const res = await fetch('/api/categories/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignments,
          mode: assignMode,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to assign categories');
      }

      // Clear selections and close confirm
      setSelectedProductIds(new Set());
      setSelectedCategoryIds(new Set());
      setShowConfirm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const allVisibleSelected = filteredProducts.length > 0 &&
    filteredProducts.every(p => selectedProductIds.has(p.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/ops/settings/categories"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className="p-2 bg-teal-100 rounded-lg">
            <Package className="w-6 h-6 text-teal-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bulk Category Assignment</h1>
            <p className="text-sm text-gray-600">
              Assign categories to multiple products at once
            </p>
          </div>
        </div>
      </div>

      {/* Uncategorized warning */}
      {uncategorizedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {uncategorizedCount} products have no categories assigned
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Products without categories won&apos;t appear in the retailer catalog.
            </p>
            <button
              onClick={() => setCategoryFilter('uncategorized')}
              className="mt-2 text-sm font-medium text-amber-800 hover:text-amber-900 underline"
            >
              Show uncategorized products
            </button>
          </div>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Products Panel */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col max-h-[calc(100vh-300px)]">
          <div className="p-4 border-b border-gray-200 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Products</h2>
              <span className="text-sm text-gray-500">
                {selectedProductIds.size} selected
              </span>
            </div>

            {/* Product filters */}
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={strainFilter}
                  onChange={(e) => setStrainFilter(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">All strains</option>
                  {strains.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as any)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="all">All products</option>
                  <option value="uncategorized">Uncategorized</option>
                  <option value="categorized">Has categories</option>
                </select>
              </div>
            </div>

            {/* Select all */}
            <button
              onClick={toggleAllProducts}
              className="text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              {allVisibleSelected ? 'Deselect all visible' : 'Select all visible'}
            </button>
          </div>

          {/* Products list */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {filteredProducts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No products match your filters
              </div>
            ) : (
              filteredProducts.map(product => (
                <label
                  key={product.id}
                  className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                    selectedProductIds.has(product.id)
                      ? 'bg-teal-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-center w-5 h-5">
                    {selectedProductIds.has(product.id) ? (
                      <div className="w-5 h-5 bg-teal-500 rounded flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 border-2 border-gray-300 rounded" />
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedProductIds.has(product.id)}
                    onChange={() => toggleProduct(product.id)}
                    className="sr-only"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{product.name}</div>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span className="font-mono">{product.sku}</span>
                      {product.strain && (
                        <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                          {product.strain.shortCode}
                        </span>
                      )}
                      {product.categoryIds.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded text-xs">
                          {product.categoryIds.length} cat.
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Categories Panel */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col max-h-[calc(100vh-300px)]">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Categories</h2>
              <span className="text-sm text-gray-500">
                {selectedCategoryIds.size} selected
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Select categories to assign to the selected products
            </p>
          </div>

          {/* Categories list */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {categories.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Tag className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <p>No categories available</p>
                <Link
                  href="/ops/settings/categories"
                  className="mt-2 inline-block text-sm text-teal-600 hover:text-teal-700"
                >
                  Create categories first
                </Link>
              </div>
            ) : (
              categories.map(category => (
                <label
                  key={category.id}
                  className={`flex items-start gap-3 p-3 cursor-pointer transition-colors ${
                    selectedCategoryIds.has(category.id)
                      ? 'bg-teal-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-center w-5 h-5 mt-0.5">
                    {selectedCategoryIds.has(category.id) ? (
                      <div className="w-5 h-5 bg-teal-500 rounded flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 border-2 border-gray-300 rounded" />
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={selectedCategoryIds.has(category.id)}
                    onChange={() => toggleCategory(category.id)}
                    className="sr-only"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-teal-600" />
                      <span className="font-medium text-gray-900">{category.name}</span>
                      <span className="text-xs text-gray-500">
                        ({category.productCount} products)
                      </span>
                    </div>
                    {category.description && (
                      <p className="text-sm text-gray-500 mt-0.5">{category.description}</p>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Action bar */}
      {(selectedProductIds.size > 0 || selectedCategoryIds.size > 0) && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg p-4 z-10">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-sm text-gray-500">Selected:</span>
                <span className="ml-2 font-medium text-gray-900">
                  {selectedProductIds.size} products, {selectedCategoryIds.size} categories
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Mode:</span>
                <select
                  value={assignMode}
                  onChange={(e) => setAssignMode(e.target.value as 'add' | 'replace')}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="add">Add to existing</option>
                  <option value="replace">Replace all</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSelectedProductIds(new Set());
                  setSelectedCategoryIds(new Set());
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Clear Selection
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={selectedProductIds.size === 0 || selectedCategoryIds.size === 0}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Confirm Assignment</h3>
              <button
                onClick={() => setShowConfirm(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4">
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}
              <p className="text-gray-700">
                You are about to {assignMode === 'add' ? 'add' : 'replace categories for'}{' '}
                <strong>{selectedProductIds.size} products</strong> with{' '}
                <strong>{selectedCategoryIds.size} categories</strong>.
              </p>
              {assignMode === 'replace' && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-sm text-amber-800">
                    <strong>Replace mode:</strong> This will remove all existing category
                    assignments and replace them with the selected categories.
                  </p>
                </div>
              )}
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Categories:</p>
                <div className="flex flex-wrap gap-2">
                  {categories
                    .filter(c => selectedCategoryIds.has(c.id))
                    .map(c => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-teal-100 text-teal-700 rounded text-sm"
                      >
                        <Tag className="w-3 h-3" />
                        {c.name}
                      </span>
                    ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                disabled={isSubmitting}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Applying...
                  </>
                ) : (
                  'Confirm Assignment'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spacer for fixed action bar */}
      {(selectedProductIds.size > 0 || selectedCategoryIds.size > 0) && (
        <div className="h-20" />
      )}
    </div>
  );
}
