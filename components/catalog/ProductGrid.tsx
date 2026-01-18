'use client';

import { useState, useMemo } from 'react';
import { Search, Filter, Package } from 'lucide-react';
import { ProductCard } from './ProductCard';

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  effectivePrice: number | null;
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

interface ProductGridProps {
  products: Product[];
  catalogToken: string;
  isInternalView?: boolean;
}

type SortOption = 'name' | 'price-asc' | 'price-desc';
type StockFilter = 'all' | 'in-stock' | 'available';

export function ProductGrid({ products, catalogToken, isInternalView = false }: ProductGridProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('name');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');

  const filteredAndSortedProducts = useMemo(() => {
    let result = [...products];

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        p =>
          p.name.toLowerCase().includes(searchLower) ||
          p.sku.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower)
      );
    }

    // Stock filter
    if (stockFilter === 'in-stock') {
      result = result.filter(p => p.stockStatus === 'IN_STOCK');
    } else if (stockFilter === 'available') {
      result = result.filter(p => p.stockStatus !== 'OUT_OF_STOCK');
    }

    // Sort
    result.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'price-asc':
          return (a.effectivePrice || 0) - (b.effectivePrice || 0);
        case 'price-desc':
          return (b.effectivePrice || 0) - (a.effectivePrice || 0);
        default:
          return 0;
      }
    });

    return result;
  }, [products, search, sort, stockFilter]);

  return (
    <div>
      {/* Search and filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Stock filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={stockFilter}
              onChange={e => setStockFilter(e.target.value as StockFilter)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Products</option>
              <option value="available">Available</option>
              <option value="in-stock">In Stock Only</option>
            </select>
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortOption)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="name">Sort by Name</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </select>
        </div>

        {/* Results count */}
        <div className="mt-3 text-sm text-gray-500">
          Showing {filteredAndSortedProducts.length} of {products.length} products
        </div>
      </div>

      {/* Product grid */}
      {filteredAndSortedProducts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAndSortedProducts.map(product => (
            <ProductCard
              key={product.id}
              {...product}
              catalogToken={catalogToken}
              isInternalView={isInternalView}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-500">
            {search
              ? 'Try adjusting your search or filters'
              : 'No products are available in this catalog'}
          </p>
        </div>
      )}
    </div>
  );
}
