'use client';

import Link from 'next/link';
import { Package } from 'lucide-react';

interface ProductCardProps {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  effectivePrice: number | null;
  stockStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  catalogToken: string;
}

export function ProductCard({
  id,
  name,
  sku,
  description,
  imageUrl,
  effectivePrice,
  stockStatus,
  catalogToken
}: ProductCardProps) {
  const stockBadge = {
    IN_STOCK: { label: 'In Stock', className: 'bg-green-100 text-green-800' },
    LOW_STOCK: { label: 'Low Stock', className: 'bg-yellow-100 text-yellow-800' },
    OUT_OF_STOCK: { label: 'Out of Stock', className: 'bg-red-100 text-red-800' }
  }[stockStatus];

  return (
    <Link
      href={`/catalog/${catalogToken}/product/${id}`}
      className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-indigo-200 transition-all duration-200"
    >
      {/* Image */}
      <div className="aspect-square bg-gray-100 relative overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-16 h-16 text-gray-300" />
          </div>
        )}

        {/* Stock badge */}
        <div className="absolute top-3 right-3">
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${stockBadge.className}`}>
            {stockBadge.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <p className="text-xs text-gray-500 font-mono mb-1">{sku}</p>
        <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
          {name}
        </h3>

        {description && (
          <p className="text-sm text-gray-500 mt-2 line-clamp-2">{description}</p>
        )}

        {/* Price */}
        <div className="mt-4 flex items-center justify-between">
          {effectivePrice !== null ? (
            <span className="text-lg font-bold text-gray-900">
              ${effectivePrice.toFixed(2)}
            </span>
          ) : (
            <span className="text-sm text-gray-400">Price on request</span>
          )}

          <span className="text-sm text-indigo-600 font-medium group-hover:underline">
            View Details
          </span>
        </div>
      </div>
    </Link>
  );
}
