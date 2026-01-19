'use client';

import { useRef, useState } from 'react';
import { Tag, ChevronLeft, ChevronRight } from 'lucide-react';
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

interface Category {
  id: string;
  name: string;
  description: string | null;
}

interface Props {
  category: Category;
  products: Product[];
  catalogToken: string;
  isInternalView?: boolean;
}

export function PublicCategoryRow({ category, products, catalogToken, isInternalView = false }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftArrow(scrollLeft > 0);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 320; // Scroll by card width + gap
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative">
      {/* Category Header */}
      <div className="flex items-center gap-2 mb-4">
        <Tag className="w-5 h-5 text-indigo-600" />
        <h2 className="text-xl font-semibold text-gray-900">{category.name}</h2>
        <span className="text-sm text-gray-500">({products.length} products)</span>
        {category.description && (
          <span className="text-sm text-gray-400 hidden md:inline">
            &mdash; {category.description}
          </span>
        )}
      </div>

      {/* Carousel Container */}
      <div className="relative group">
        {/* Left Arrow */}
        {showLeftArrow && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity -ml-4"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>
        )}

        {/* Products Carousel */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex gap-4 overflow-x-auto scroll-smooth pb-4 scrollbar-hide"
          style={{
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {products.map((product) => (
            <div
              key={product.id}
              className="w-[280px] flex-shrink-0"
              style={{ scrollSnapAlign: 'start' }}
            >
              <ProductCard
                id={product.id}
                name={product.name}
                sku={product.sku}
                description={product.description}
                imageUrl={product.imageUrl}
                effectivePrice={product.effectivePrice}
                stockStatus={product.stockStatus}
                catalogToken={catalogToken}
                isInternalView={isInternalView}
              />
            </div>
          ))}
        </div>

        {/* Right Arrow */}
        {showRightArrow && products.length > 3 && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity -mr-4"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-6 h-6 text-gray-700" />
          </button>
        )}
      </div>

      {/* Gradient overlays for scroll indication */}
      {showLeftArrow && (
        <div className="absolute left-0 top-[60px] bottom-4 w-8 bg-gradient-to-r from-gray-50 to-transparent pointer-events-none" />
      )}
      {showRightArrow && products.length > 3 && (
        <div className="absolute right-0 top-[60px] bottom-4 w-8 bg-gradient-to-l from-gray-50 to-transparent pointer-events-none" />
      )}
    </div>
  );
}
