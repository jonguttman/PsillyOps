'use client';

import Link from 'next/link';
import { Package } from 'lucide-react';

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

interface Props {
  product: Product;
  compact?: boolean;
}

export default function OpsProductCard({ product, compact = false }: Props) {
  if (compact) {
    return (
      <Link
        href={`/ops/products/${product.id}`}
        className="flex-shrink-0 w-48 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md hover:border-gray-300 transition-all"
      >
        {/* Image */}
        <div className="aspect-square bg-gray-100 relative">
          {product.publicImageUrl ? (
            <img
              src={product.publicImageUrl}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-12 h-12 text-gray-300" />
            </div>
          )}
          {product.strain && (
            <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-purple-100 text-purple-800 text-xs font-medium rounded">
              {product.strain.shortCode}
            </span>
          )}
        </div>
        {/* Info */}
        <div className="p-3">
          <h3 className="font-medium text-gray-900 text-sm truncate" title={product.name}>
            {product.name}
          </h3>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs font-mono text-gray-500">{product.sku}</span>
            {product.wholesalePrice !== null && (
              <span className="text-sm font-semibold text-gray-900">
                ${product.wholesalePrice.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/ops/products/${product.id}`}
      className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md hover:border-gray-300 transition-all"
    >
      {/* Image */}
      <div className="aspect-square bg-gray-100 relative">
        {product.publicImageUrl ? (
          <img
            src={product.publicImageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-16 h-16 text-gray-300" />
          </div>
        )}
        {product.strain && (
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-purple-100 text-purple-800 text-xs font-medium rounded">
            {product.strain.shortCode}: {product.strain.name}
          </span>
        )}
      </div>
      {/* Info */}
      <div className="p-4">
        <h3 className="font-medium text-gray-900 truncate" title={product.name}>
          {product.name}
        </h3>
        <p className="text-sm font-mono text-gray-500 mt-0.5">{product.sku}</p>
        <div className="flex items-center justify-between mt-3">
          {product.wholesalePrice !== null ? (
            <span className="text-lg font-semibold text-gray-900">
              ${product.wholesalePrice.toFixed(2)}
            </span>
          ) : (
            <span className="text-sm text-gray-400">No price set</span>
          )}
        </div>
      </div>
    </Link>
  );
}
