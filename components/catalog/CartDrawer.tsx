'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X, ShoppingCart, Package, Minus, Plus, Trash2, Send, Loader2, ClipboardList } from 'lucide-react';
import { useCart, SamplePurpose, SAMPLE_PURPOSE_LABELS } from './CartContext';

interface CartDrawerProps {
  catalogLinkId: string;
  token: string;
}

const REQUESTS_STORAGE_PREFIX = 'catalog-requests-';

export function CartDrawer({ catalogLinkId, token }: CartDrawerProps) {
  const { items, isOpen, setIsOpen, removeItem, updateQuantity, clearCart, itemCount } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Contact info
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [message, setMessage] = useState('');

  const quoteItems = items.filter(item => item.itemType === 'QUOTE');
  const sampleItems = items.filter(item => item.itemType === 'SAMPLE');

  // Validation - name and phone are required
  const isValid = contactName.trim().length > 0 && contactPhone.trim().length > 0;

  const saveRequestToLocalStorage = (requestId: string) => {
    try {
      const storageKey = `${REQUESTS_STORAGE_PREFIX}${token}`;
      const existing = localStorage.getItem(storageKey);
      const requestIds: string[] = existing ? JSON.parse(existing) : [];
      if (!requestIds.includes(requestId)) {
        requestIds.push(requestId);
        localStorage.setItem(storageKey, JSON.stringify(requestIds));
      }
    } catch (err) {
      console.error('Failed to save request ID to localStorage:', err);
    }
  };

  const handleSubmit = async () => {
    if (items.length === 0 || !isValid) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/catalog/${token}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogLinkId,
          items: items.map(item => ({
            productId: item.productId,
            itemType: item.itemType,
            quantity: item.quantity,
            // Include both legacy and new fields for backward compatibility
            sampleReason: item.sampleReason,
            samplePurpose: item.samplePurpose,
            samplePurposeNotes: item.samplePurposeNotes
          })),
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim() || undefined,
          contactPhone: contactPhone.trim(),
          message: message.trim() || undefined
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit request');
      }

      const data = await response.json();
      const requestId = data.id || data.requestId;

      if (requestId) {
        saveRequestToLocalStorage(requestId);
        setSubmittedRequestId(requestId);
      }

      setSubmitted(true);
      clearCart();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    if (submitted) {
      setSubmitted(false);
      setSubmittedRequestId(null);
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      setMessage('');
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:bg-indigo-700 transition-colors z-50"
      >
        <ShoppingCart className="w-6 h-6" />
        {itemCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {itemCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={handleClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">Your Request</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {submitted ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Send className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Request Sent!</h3>
              <p className="text-gray-600">
                Your sales representative will be in touch with you shortly to discuss your quote and sample requests.
              </p>
              <div className="mt-6 space-y-3">
                <Link
                  href={`/catalog/${token}/requests`}
                  className="flex items-center justify-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  onClick={handleClose}
                >
                  <ClipboardList className="w-5 h-5" />
                  View My Requests
                </Link>
                <button
                  onClick={handleClose}
                  className="w-full px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Continue Browsing
                </button>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Your cart is empty</p>
              <p className="text-sm mt-1">Add products to request a quote or sample</p>
            </div>
          ) : (
            <div className="p-4 space-y-6">
              {/* Quote Items */}
              {quoteItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                    Quote Requests ({quoteItems.length})
                  </h3>
                  <div className="space-y-3">
                    {quoteItems.map(item => (
                      <CartItemCard
                        key={`quote-${item.productId}`}
                        item={item}
                        onRemove={() => removeItem(item.productId, 'QUOTE')}
                        onUpdateQuantity={(qty) => updateQuantity(item.productId, 'QUOTE', qty)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Sample Items */}
              {sampleItems.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
                    Sample Requests ({sampleItems.length})
                  </h3>
                  <div className="space-y-3">
                    {sampleItems.map(item => (
                      <CartItemCard
                        key={`sample-${item.productId}`}
                        item={item}
                        onRemove={() => removeItem(item.productId, 'SAMPLE')}
                        onUpdateQuantity={(qty) => updateQuantity(item.productId, 'SAMPLE', qty)}
                        showPurpose
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Contact Info */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Contact Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Your name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Enter your name"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Phone number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="Enter your phone number"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Email address <span className="text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Message <span className="text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      placeholder="Additional message for your sales rep..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    />
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!submitted && items.length > 0 && (
          <div className="p-4 border-t bg-gray-50">
            <button
              onClick={handleSubmit}
              disabled={submitting || !isValid}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send to Sales Rep
                </>
              )}
            </button>
            {!isValid && (
              <p className="text-xs text-amber-600 text-center mt-2">
                Please enter your name and phone number to submit
              </p>
            )}
            {isValid && (
              <p className="text-xs text-gray-500 text-center mt-2">
                Your rep will reach out with pricing and availability
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

interface CartItemCardProps {
  item: {
    productId: string;
    productName: string;
    productSku: string;
    productImageUrl: string | null;
    quantity: number;
    sampleReason?: string;
    samplePurpose?: SamplePurpose;
    samplePurposeNotes?: string;
  };
  onRemove: () => void;
  onUpdateQuantity: (quantity: number) => void;
  showPurpose?: boolean;
}

function CartItemCard({ item, onRemove, onUpdateQuantity, showPurpose }: CartItemCardProps) {
  // Get the display text for the purpose
  const getPurposeDisplay = () => {
    if (item.samplePurpose) {
      const label = SAMPLE_PURPOSE_LABELS[item.samplePurpose];
      if (item.samplePurpose === 'OTHER' && item.samplePurposeNotes) {
        return `${label}: ${item.samplePurposeNotes}`;
      }
      return label;
    }
    // Fallback to legacy sampleReason
    return item.sampleReason;
  };

  const purposeDisplay = getPurposeDisplay();

  return (
    <div className="flex gap-3 p-3 bg-gray-50 rounded-lg">
      {/* Image */}
      <div className="w-16 h-16 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
        {item.productImageUrl ? (
          <img
            src={item.productImageUrl}
            alt={item.productName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-6 h-6 text-gray-400" />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-gray-900 text-sm truncate">{item.productName}</h4>
        <p className="text-xs text-gray-500 font-mono">{item.productSku}</p>

        {showPurpose && purposeDisplay && (
          <p className="text-xs text-indigo-600 mt-1 line-clamp-2">
            {purposeDisplay}
          </p>
        )}

        {/* Quantity controls */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => onUpdateQuantity(item.quantity - 1)}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium w-8 text-center">{item.quantity}</span>
          <button
            onClick={() => onUpdateQuantity(item.quantity + 1)}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="p-1 text-gray-400 hover:text-red-500 transition-colors self-start"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
