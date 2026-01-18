'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LayoutGrid,
  List,
  Rows3,
  Tag,
  Package,
  Search,
} from 'lucide-react';
import CategoryRow from '@/components/catalog/CategoryRow';
import OpsProductCard from '@/components/catalog/OpsProductCard';
import ViewToggle from '@/components/catalog/ViewToggle';

interface Product {
  id: string;
  name: string;
  sku: string;
  wholesalePrice: number | null;
  publicImageUrl: string | null;
  strain: {
    id: string;
    name: string;
    shortCode: string;
  } | null;
}

interface Category {
  id: string;
  name: string;
  description: string | null;
  products: Product[];
}

type ViewMode = 'carousel' | 'grid' | 'list';

interface Props {
  categories: Category[];
  isAdmin: boolean;
}

export default function CatalogClient({ categories, isAdmin }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('carousel');
  const [searchQuery, setSearchQuery] = useState('');

  // Load view preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('catalog-view-mode');
    if (saved && ['carousel', 'grid', 'list'].includes(saved)) {
      setViewMode(saved as ViewMode);
    }
  }, []);

  // Save view preference to localStorage
  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('catalog-view-mode', mode);
  };

  // Filter products by search
  const filteredCategories = categories.map(cat => ({
    ...cat,
    products: cat.products.filter(p =>
      searchQuery === '' ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.strain?.name.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(cat => cat.products.length > 0);

  // Stats
  const totalProducts = categories.reduce((sum, cat) => sum + cat.products.length, 0);

  // For grid/list view, flatten products with category info
  const allProducts = filteredCategories.flatMap(cat =>
    cat.products.map(p => ({ ...p, categoryName: cat.name, categoryId: cat.id }))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 rounded-lg">
            <Package className="w-6 h-6 text-teal-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Product Catalog</h1>
            <p className="text-sm text-gray-600">
              {categories.length} categories, {totalProducts} products
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link
              href="/ops/settings/categories"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <Tag className="w-4 h-4 mr-2" />
              Manage Categories
            </Link>
          )}
          <ViewToggle value={viewMode} onChange={handleViewChange} />
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search products by name, SKU, or strain..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
      </div>

      {/* Empty state */}
      {categories.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow-sm border border-gray-200">
          <Package className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No products in catalog</h3>
          <p className="text-gray-500 mb-4">
            Products need to be assigned to categories to appear here.
          </p>
          {isAdmin && (
            <Link
              href="/ops/settings/categories"
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md"
            >
              Set up categories
            </Link>
          )}
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow-sm border border-gray-200">
          <Search className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
          <p className="text-gray-500">
            No products match your search &quot;{searchQuery}&quot;
          </p>
        </div>
      ) : (
        <>
          {/* Carousel View */}
          {viewMode === 'carousel' && (
            <div className="space-y-8">
              {filteredCategories.map(category => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  products={category.products}
                />
              ))}
            </div>
          )}

          {/* Grid View */}
          {viewMode === 'grid' && (
            <div className="space-y-8">
              {filteredCategories.map(category => (
                <div key={category.id}>
                  <div className="flex items-center gap-2 mb-4">
                    <Tag className="w-5 h-5 text-teal-600" />
                    <h2 className="text-lg font-semibold text-gray-900">{category.name}</h2>
                    <span className="text-sm text-gray-500">
                      ({category.products.length} products)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {category.products.map(product => (
                      <OpsProductCard key={product.id} product={product} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* List View */}
          {viewMode === 'list' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      SKU
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Strain
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {allProducts.map((product, index) => (
                    <tr key={`${product.id}-${index}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {product.publicImageUrl ? (
                            <img
                              src={product.publicImageUrl}
                              alt={product.name}
                              className="w-10 h-10 rounded object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center">
                              <Package className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          <Link
                            href={`/ops/products/${product.id}`}
                            className="font-medium text-gray-900 hover:text-teal-600"
                          >
                            {product.name}
                          </Link>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-gray-500">
                        {product.sku}
                      </td>
                      <td className="px-6 py-4">
                        {product.strain ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            {product.strain.shortCode}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800">
                          {product.categoryName}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                        {product.wholesalePrice !== null
                          ? `$${product.wholesalePrice.toFixed(2)}`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
