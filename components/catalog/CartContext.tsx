'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

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
