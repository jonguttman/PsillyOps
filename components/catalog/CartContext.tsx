'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export interface CartItem {
  productId: string;
  productName: string;
  productSku: string;
  productImageUrl: string | null;
  itemType: 'QUOTE' | 'SAMPLE';
  quantity: number;
  sampleReason?: string;
}

interface CartContextType {
  items: CartItem[];
  addToQuote: (product: { id: string; name: string; sku: string; imageUrl: string | null }, quantity: number) => void;
  addSampleRequest: (product: { id: string; name: string; sku: string; imageUrl: string | null }, quantity: number, reason: string) => void;
  removeItem: (productId: string, itemType: 'QUOTE' | 'SAMPLE') => void;
  updateQuantity: (productId: string, itemType: 'QUOTE' | 'SAMPLE', quantity: number) => void;
  clearCart: () => void;
  itemCount: number;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | null>(null);

interface CartProviderProps {
  children: ReactNode;
  catalogToken?: string;
}

const CART_STORAGE_PREFIX = 'catalog-cart-';

export function CartProvider({ children, catalogToken }: CartProviderProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const storageKey = catalogToken ? `${CART_STORAGE_PREFIX}${catalogToken}` : null;

  // Load cart from localStorage on mount
  useEffect(() => {
    if (!storageKey) {
      setInitialized(true);
      return;
    }

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setItems(parsed);
        }
      }
    } catch (error) {
      console.error('Failed to load cart from localStorage:', error);
    }
    setInitialized(true);
  }, [storageKey]);

  // Save cart to localStorage when items change
  useEffect(() => {
    if (!storageKey || !initialized) return;

    try {
      if (items.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(items));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.error('Failed to save cart to localStorage:', error);
    }
  }, [items, storageKey, initialized]);

  const addToQuote = useCallback((
    product: { id: string; name: string; sku: string; imageUrl: string | null },
    quantity: number
  ) => {
    setItems(current => {
      // Check if already in cart
      const existing = current.find(
        item => item.productId === product.id && item.itemType === 'QUOTE'
      );

      if (existing) {
        return current.map(item =>
          item.productId === product.id && item.itemType === 'QUOTE'
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }

      return [...current, {
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        productImageUrl: product.imageUrl,
        itemType: 'QUOTE',
        quantity
      }];
    });
    setIsOpen(true);
  }, []);

  const addSampleRequest = useCallback((
    product: { id: string; name: string; sku: string; imageUrl: string | null },
    quantity: number,
    reason: string
  ) => {
    setItems(current => {
      // Check if already in cart
      const existing = current.find(
        item => item.productId === product.id && item.itemType === 'SAMPLE'
      );

      if (existing) {
        return current.map(item =>
          item.productId === product.id && item.itemType === 'SAMPLE'
            ? { ...item, quantity: item.quantity + quantity, sampleReason: reason }
            : item
        );
      }

      return [...current, {
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        productImageUrl: product.imageUrl,
        itemType: 'SAMPLE',
        quantity,
        sampleReason: reason
      }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((productId: string, itemType: 'QUOTE' | 'SAMPLE') => {
    setItems(current => current.filter(
      item => !(item.productId === productId && item.itemType === itemType)
    ));
  }, []);

  const updateQuantity = useCallback((productId: string, itemType: 'QUOTE' | 'SAMPLE', quantity: number) => {
    if (quantity < 1) {
      removeItem(productId, itemType);
      return;
    }
    setItems(current => current.map(item =>
      item.productId === productId && item.itemType === itemType
        ? { ...item, quantity }
        : item
    ));
  }, [removeItem]);

  const clearCart = useCallback(() => {
    setItems([]);
    // localStorage cleanup happens via the useEffect above
  }, []);

  return (
    <CartContext.Provider
      value={{
        items,
        addToQuote,
        addSampleRequest,
        removeItem,
        updateQuantity,
        clearCart,
        itemCount: items.length,
        isOpen,
        setIsOpen
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
