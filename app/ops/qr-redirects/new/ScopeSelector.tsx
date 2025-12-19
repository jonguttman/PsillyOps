'use client';

import { useState, useMemo, useCallback } from 'react';
import { Check, Search, Package, Layers, Archive, X } from 'lucide-react';

// Types for the data passed from server component
export interface ProductItem {
  id: string;
  name: string;
  sku: string;
  hasActiveRule: boolean;
}

export interface BatchItem {
  id: string;
  batchCode: string;
  productName: string;
  status: string;
  isPlanned: boolean;
  hasActiveRule?: boolean;
}

interface ScopeSelectorProps {
  products: ProductItem[];
  recentBatches: BatchItem[];
  plannedBatches: BatchItem[];
}

type TabType = 'products' | 'batches' | 'inventory';

export default function ScopeSelector({
  products,
  recentBatches,
  plannedBatches,
}: ScopeSelectorProps) {
  const [activeTab, setActiveTab] = useState<TabType>('products');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Phase 7.2: Multi-select using Sets
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());

  // Determine current scope type based on selection
  const scopeType = useMemo(() => {
    if (selectedProductIds.size > 0) return 'PRODUCT';
    if (selectedBatchIds.size > 0) return 'BATCH';
    return null;
  }, [selectedProductIds.size, selectedBatchIds.size]);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  // Filter batches by search query
  const filteredRecentBatches = useMemo(() => {
    if (!searchQuery.trim()) return recentBatches;
    const query = searchQuery.toLowerCase();
    return recentBatches.filter(
      (b) =>
        b.batchCode.toLowerCase().includes(query) ||
        b.productName.toLowerCase().includes(query)
    );
  }, [recentBatches, searchQuery]);

  const filteredPlannedBatches = useMemo(() => {
    if (!searchQuery.trim()) return plannedBatches;
    const query = searchQuery.toLowerCase();
    return plannedBatches.filter(
      (b) =>
        b.batchCode.toLowerCase().includes(query) ||
        b.productName.toLowerCase().includes(query)
    );
  }, [plannedBatches, searchQuery]);

  // All filtered batches combined
  const allFilteredBatches = useMemo(() => {
    return [...filteredRecentBatches, ...filteredPlannedBatches];
  }, [filteredRecentBatches, filteredPlannedBatches]);

  // Count selected items with active rules (for warning)
  const selectedProductsWithActiveRules = useMemo(() => {
    return products.filter(p => selectedProductIds.has(p.id) && p.hasActiveRule);
  }, [products, selectedProductIds]);

  const selectedBatchesWithActiveRules = useMemo(() => {
    const allBatches = [...recentBatches, ...plannedBatches];
    return allBatches.filter(b => selectedBatchIds.has(b.id) && b.hasActiveRule);
  }, [recentBatches, plannedBatches, selectedBatchIds]);

  // Get selected items info for summary
  const selectedProducts = useMemo(() => {
    return products.filter(p => selectedProductIds.has(p.id));
  }, [products, selectedProductIds]);

  const selectedBatches = useMemo(() => {
    const allBatches = [...recentBatches, ...plannedBatches];
    return allBatches.filter(b => selectedBatchIds.has(b.id));
  }, [recentBatches, plannedBatches, selectedBatchIds]);

  // Handle product selection toggle
  const handleProductSelect = useCallback((productId: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }, []);

  // Handle batch selection toggle
  const handleBatchSelect = useCallback((batchId: string) => {
    setSelectedBatchIds(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  }, []);

  // Select all visible products
  const handleSelectAllProducts = useCallback(() => {
    const eligibleIds = filteredProducts
      .filter(p => !p.hasActiveRule)
      .map(p => p.id);
    setSelectedProductIds(new Set(eligibleIds));
  }, [filteredProducts]);

  // Select all visible batches
  const handleSelectAllBatches = useCallback(() => {
    const eligibleIds = allFilteredBatches
      .filter(b => !b.hasActiveRule)
      .map(b => b.id);
    setSelectedBatchIds(new Set(eligibleIds));
  }, [allFilteredBatches]);

  // Clear product selection
  const handleClearProductSelection = useCallback(() => {
    setSelectedProductIds(new Set());
  }, []);

  // Clear batch selection
  const handleClearBatchSelection = useCallback(() => {
    setSelectedBatchIds(new Set());
  }, []);

  // Clear search and selection when switching tabs
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchQuery('');
    // Clear selection when switching tabs (per Phase 7.2 decision)
    if (tab === 'products') {
      setSelectedBatchIds(new Set());
    } else if (tab === 'batches') {
      setSelectedProductIds(new Set());
    } else if (tab === 'inventory') {
      setSelectedProductIds(new Set());
      setSelectedBatchIds(new Set());
    }
  };

  // Get status badge color
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'PLANNED':
        return 'bg-blue-100 text-blue-800';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800';
      case 'QC_HOLD':
        return 'bg-orange-100 text-orange-800';
      case 'RELEASED':
        return 'bg-green-100 text-green-800';
      case 'EXHAUSTED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const formatStatus = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Calculate selection counts
  const productSelectionCount = selectedProductIds.size;
  const batchSelectionCount = selectedBatchIds.size;
  const totalSelectionCount = productSelectionCount + batchSelectionCount;

  // Check if any selected items have active rules
  const hasConflicts = selectedProductsWithActiveRules.length > 0 || selectedBatchesWithActiveRules.length > 0;
  const conflictCount = selectedProductsWithActiveRules.length + selectedBatchesWithActiveRules.length;

  // Format skipped items list
  const formatSkippedItems = () => {
    const items = scopeType === 'PRODUCT' 
      ? selectedProductsWithActiveRules.map(p => p.name)
      : selectedBatchesWithActiveRules.map(b => b.batchCode);
    
    if (items.length <= 3) {
      return items.join(', ');
    }
    return `${items.slice(0, 3).join(', ')}, +${items.length - 3} more`;
  };

  return (
    <div className="space-y-4">
      {/* Hidden inputs for form submission - Phase 7.2: arrays */}
      <input type="hidden" name="scopeType" value={scopeType || ''} />
      <input
        type="hidden"
        name="entityIds"
        value={scopeType === 'PRODUCT' 
          ? JSON.stringify(Array.from(selectedProductIds))
          : scopeType === 'BATCH'
          ? JSON.stringify(Array.from(selectedBatchIds))
          : '[]'
        }
      />

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6" aria-label="Tabs">
          <button
            type="button"
            onClick={() => handleTabChange('products')}
            className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === 'products'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Package className="w-4 h-4" />
            Products
            {productSelectionCount > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                {productSelectionCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('batches')}
            className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
              activeTab === 'batches'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Layers className="w-4 h-4" />
            Batches
            {batchSelectionCount > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                {batchSelectionCount}
              </span>
            )}
          </button>
          <button
            type="button"
            disabled
            className="flex items-center gap-2 py-3 px-1 border-b-2 border-transparent text-sm font-medium text-gray-300 cursor-not-allowed"
            title="Advanced inventory-level rules coming soon"
          >
            <Archive className="w-4 h-4" />
            Inventory (Advanced)
          </button>
        </nav>
      </div>

      {/* Search + Selection Controls */}
      {activeTab !== 'inventory' && (
        <div className="flex items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={
                activeTab === 'products'
                  ? 'Search by product name or SKU...'
                  : 'Search by batch code or product name...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Selection Controls */}
          <div className="flex items-center gap-2">
            {activeTab === 'products' && (
              <>
                <button
                  type="button"
                  onClick={handleSelectAllProducts}
                  className="px-3 py-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                >
                  Select all visible
                </button>
                {productSelectionCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearProductSelection}
                    className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Clear ({productSelectionCount})
                  </button>
                )}
              </>
            )}
            {activeTab === 'batches' && (
              <>
                <button
                  type="button"
                  onClick={handleSelectAllBatches}
                  className="px-3 py-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
                >
                  Select all visible
                </button>
                {batchSelectionCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearBatchSelection}
                    className="px-3 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Clear ({batchSelectionCount})
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Products Tab */}
        {activeTab === 'products' && (
          <div className="max-h-[420px] overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                {products.length === 0 ? (
                  <p>No products found. Create a product to add redirect rules.</p>
                ) : (
                  <p>No products match your search.</p>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filteredProducts.map((product) => {
                  const isSelected = selectedProductIds.has(product.id);
                  const isDisabled = product.hasActiveRule;

                  return (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => handleProductSelect(product.id)}
                        className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                          isSelected
                            ? 'bg-blue-50'
                            : isDisabled
                            ? 'bg-gray-50'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-medium ${
                                isDisabled ? 'text-gray-400' : 'text-gray-900'
                              }`}
                            >
                              {product.name}
                            </span>
                            {product.hasActiveRule && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                Has active rule
                              </span>
                            )}
                          </div>
                          <p
                            className={`text-xs ${
                              isDisabled ? 'text-gray-300' : 'text-gray-500'
                            }`}
                          >
                            {product.sku}
                          </p>
                        </div>
                        {isSelected && (
                          <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                        )}
                        {!isSelected && !isDisabled && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            No rule
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Batches Tab */}
        {activeTab === 'batches' && (
          <div className="max-h-[420px] overflow-y-auto">
            {filteredRecentBatches.length === 0 && filteredPlannedBatches.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                {recentBatches.length === 0 && plannedBatches.length === 0 ? (
                  <p>No batches available yet. Batches appear after a production order is created.</p>
                ) : (
                  <p>No batches match your search.</p>
                )}
              </div>
            ) : (
              <div>
                {/* Recent Batches Section */}
                {filteredRecentBatches.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Recent Batches
                      </h3>
                    </div>
                    <ul className="divide-y divide-gray-100">
                      {filteredRecentBatches.map((batch) => {
                        const isSelected = selectedBatchIds.has(batch.id);
                        const isDisabled = batch.hasActiveRule;

                        return (
                          <li key={batch.id}>
                            <button
                              type="button"
                              onClick={() => handleBatchSelect(batch.id)}
                              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                                isSelected
                                  ? 'bg-blue-50'
                                  : isDisabled
                                  ? 'bg-gray-50'
                                  : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-medium ${isDisabled ? 'text-gray-400' : 'text-gray-900'}`}>
                                    {batch.batchCode}
                                  </span>
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeClass(
                                      batch.status
                                    )}`}
                                  >
                                    {formatStatus(batch.status)}
                                  </span>
                                  {batch.hasActiveRule && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                      Has active rule
                                    </span>
                                  )}
                                </div>
                                <p className={`text-xs ${isDisabled ? 'text-gray-300' : 'text-gray-500'}`}>
                                  {batch.productName}
                                </p>
                              </div>
                              {isSelected && (
                                <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Planned / Pending Batches Section */}
                {filteredPlannedBatches.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Planned / Pending
                      </h3>
                    </div>
                    <ul className="divide-y divide-gray-100">
                      {filteredPlannedBatches.map((batch) => {
                        const isSelected = selectedBatchIds.has(batch.id);
                        const isDisabled = batch.hasActiveRule;

                        return (
                          <li key={batch.id}>
                            <button
                              type="button"
                              onClick={() => handleBatchSelect(batch.id)}
                              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                                isSelected
                                  ? 'bg-blue-50'
                                  : isDisabled
                                  ? 'bg-gray-50'
                                  : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-medium ${isDisabled ? 'text-gray-400' : 'text-gray-900'}`}>
                                    {batch.batchCode}
                                  </span>
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusBadgeClass(
                                      batch.status
                                    )}`}
                                  >
                                    {formatStatus(batch.status)}
                                  </span>
                                  {batch.hasActiveRule && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                      Has active rule
                                    </span>
                                  )}
                                </div>
                                <p className={`text-xs ${isDisabled ? 'text-gray-300' : 'text-gray-500'}`}>
                                  {batch.productName}
                                </p>
                              </div>
                              {isSelected && (
                                <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Inventory Tab (Disabled) */}
        {activeTab === 'inventory' && (
          <div className="p-8 text-center text-gray-500">
            <Archive className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-600">Coming Soon</p>
            <p className="text-xs text-gray-400 mt-1">
              Advanced inventory-level rules will be available in a future update.
            </p>
          </div>
        )}
      </div>

      {/* Selection Summary & Warnings */}
      <div className="space-y-3">
        {/* No selection helper */}
        {totalSelectionCount === 0 && activeTab !== 'inventory' && (
          <p className="text-sm text-amber-600 flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            Select at least one {activeTab === 'products' ? 'product' : 'batch'} to continue
          </p>
        )}

        {/* Selection summary */}
        {totalSelectionCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Check className="w-4 h-4" />
            <span>
              Creating rule for {totalSelectionCount} {scopeType === 'PRODUCT' ? (totalSelectionCount === 1 ? 'product' : 'products') : (totalSelectionCount === 1 ? 'batch' : 'batches')}
            </span>
          </div>
        )}

        {/* Conflict warning */}
        {hasConflicts && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="text-sm text-amber-800">
                <p className="font-medium">Some selected items already have active redirect rules and will be skipped.</p>
                <p className="text-xs mt-1 text-amber-700">
                  Skipped ({conflictCount}): {formatSkippedItems()}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
