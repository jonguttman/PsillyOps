'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Copy, Check, QrCode, ExternalLink, Plus, X } from 'lucide-react';

interface Retailer {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  description: string | null;
  _count: {
    products: number;
  };
}

interface Product {
  id: string;
  name: string;
  sku: string;
  wholesalePrice: number | null;
}

interface NewCatalogLinkFormProps {
  retailers: Retailer[];
  categories: Category[];
  products: Product[];
  isAdmin: boolean;
  currentUserId: string;
}

// Calculate default expiration (30 days from now)
function getDefaultExpiration(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 16); // Format for datetime-local input
}

export function NewCatalogLinkForm({ retailers, categories, products, isAdmin, currentUserId }: NewCatalogLinkFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<{ token: string; catalogUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [retailerList, setRetailerList] = useState<Retailer[]>(retailers);

  // New retailer modal state
  const [showNewRetailerModal, setShowNewRetailerModal] = useState(false);
  const [newRetailerSubmitting, setNewRetailerSubmitting] = useState(false);
  const [newRetailerData, setNewRetailerData] = useState({
    name: '',
    contactPhone: '',
    contactEmail: '',
    shippingAddress: '',
    notes: ''
  });

  const [formData, setFormData] = useState({
    retailerId: '',
    displayName: '',
    categorySubset: [] as string[],
    customPricing: {} as Record<string, string>,
    expiresAt: getDefaultExpiration(), // Default to 30 days
    neverExpires: false
  });

  const [useCategorySubset, setUseCategorySubset] = useState(false);
  const [useCustomPricing, setUseCustomPricing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // Build payload
      const payload: any = {
        retailerId: formData.retailerId
      };

      if (formData.displayName.trim()) {
        payload.displayName = formData.displayName.trim();
      }

      if (useCategorySubset && formData.categorySubset.length > 0) {
        payload.categorySubset = formData.categorySubset;
      }

      // Only ADMINs can set custom pricing
      if (isAdmin && useCustomPricing) {
        const pricing: Record<string, number> = {};
        for (const [productId, priceStr] of Object.entries(formData.customPricing)) {
          const price = parseFloat(priceStr);
          if (!isNaN(price) && price > 0) {
            pricing[productId] = price;
          }
        }
        if (Object.keys(pricing).length > 0) {
          payload.customPricing = pricing;
        }
      }

      // Handle expiration
      if (isAdmin && formData.neverExpires) {
        // Admin chose never expire - don't send expiresAt
      } else if (formData.expiresAt) {
        payload.expiresAt = new Date(formData.expiresAt).toISOString();
      }

      const res = await fetch('/api/ops/catalog-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create catalog link');
      }

      const data = await res.json();
      setCreatedLink({ token: data.token, catalogUrl: data.catalogUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (createdLink) {
      await navigator.clipboard.writeText(createdLink.catalogUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setFormData(prev => ({
      ...prev,
      categorySubset: prev.categorySubset.includes(categoryId)
        ? prev.categorySubset.filter(id => id !== categoryId)
        : [...prev.categorySubset, categoryId]
    }));
  };

  const setCustomPrice = (productId: string, price: string) => {
    setFormData(prev => ({
      ...prev,
      customPricing: { ...prev.customPricing, [productId]: price }
    }));
  };

  // Create new retailer
  const handleCreateRetailer = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewRetailerSubmitting(true);

    try {
      const res = await fetch('/api/ops/retailers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRetailerData.name,
          contactPhone: newRetailerData.contactPhone,
          contactEmail: newRetailerData.contactEmail || undefined,
          shippingAddress: newRetailerData.shippingAddress || undefined,
          notes: newRetailerData.notes || undefined,
          salesRepId: isAdmin ? undefined : currentUserId // Assign to current REP
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to create retailer');
      }

      const newRetailer = await res.json();

      // Add to list and select
      setRetailerList(prev => [...prev, { id: newRetailer.id, name: newRetailer.name }].sort((a, b) => a.name.localeCompare(b.name)));
      setFormData(prev => ({ ...prev, retailerId: newRetailer.id }));

      // Reset and close modal
      setNewRetailerData({ name: '', contactPhone: '', contactEmail: '', shippingAddress: '', notes: '' });
      setShowNewRetailerModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create retailer');
    } finally {
      setNewRetailerSubmitting(false);
    }
  };

  // Success state
  if (createdLink) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Catalog Link Created!</h2>
          <p className="text-gray-500 mb-6">Share this link with your retailer</p>

          {/* Link display */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <code className="text-sm break-all">{createdLink.catalogUrl}</code>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
            <a
              href={createdLink.catalogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open Catalog
            </a>
            <a
              href={`/api/catalog/${createdLink.token}/qr?size=400`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <QrCode className="w-4 h-4" />
              View QR Code
            </a>
          </div>

          {/* Back link */}
          <div className="mt-8">
            <Link
              href="/ops/catalog-links"
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              &larr; Back to Catalog Links
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Link
          href="/ops/catalog-links"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Catalog Links
        </Link>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Retailer selection */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Retailer</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Retailer <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <select
                  required
                  value={formData.retailerId}
                  onChange={e => setFormData(prev => ({ ...prev, retailerId: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Choose a retailer...</option>
                  {retailerList.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewRetailerModal(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Name (optional)
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={e => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder="Custom name shown on catalog"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave empty to use the retailer's name
              </p>
            </div>
          </div>
        </div>

        {/* Category selection */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Category Selection</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useCategorySubset}
                onChange={e => setUseCategorySubset(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Limit to specific categories
            </label>
          </div>

          {useCategorySubset ? (
            categories.length > 0 ? (
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                {categories.map(category => (
                  <label
                    key={category.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={formData.categorySubset.includes(category.id)}
                      onChange={() => toggleCategory(category.id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{category.name}</p>
                      {category.description && (
                        <p className="text-xs text-gray-500">{category.description}</p>
                      )}
                    </div>
                    <span className="text-sm text-gray-400">
                      {category._count.products} products
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg">
                <p className="text-sm text-gray-500">No categories available</p>
                <p className="text-xs text-gray-400 mt-1">
                  Create categories in Settings &gt; Categories first
                </p>
              </div>
            )
          ) : (
            <p className="text-sm text-gray-500">
              All categories will be shown ({categories.length} categories, {products.length} products total)
            </p>
          )}
        </div>

        {/* Custom pricing - ADMIN ONLY */}
        {isAdmin && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Custom Pricing</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useCustomPricing}
                  onChange={e => setUseCustomPricing(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Set custom prices
              </label>
            </div>

            {useCustomPricing ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {products.map(product => (
                  <div
                    key={product.id}
                    className="flex items-center gap-4 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                      <p className="text-xs text-gray-500">
                        Default: ${product.wholesalePrice?.toFixed(2) || 'N/A'}
                      </p>
                    </div>
                    <div className="w-32">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder={product.wholesalePrice?.toFixed(2) || '0.00'}
                          value={formData.customPricing[product.id] || ''}
                          onChange={e => setCustomPrice(product.id, e.target.value)}
                          className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Standard wholesale prices will be used
              </p>
            )}
          </div>
        )}

        {/* Expiration */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Expiration</h2>
            {isAdmin && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.neverExpires}
                  onChange={e => setFormData(prev => ({ ...prev, neverExpires: e.target.checked }))}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Never expires
              </label>
            )}
          </div>

          {formData.neverExpires ? (
            <p className="text-sm text-gray-500">
              Link will not expire automatically
            </p>
          ) : (
            <>
              <input
                type="datetime-local"
                value={formData.expiresAt}
                onChange={e => setFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-2">
                Default: 30 days from today
              </p>
            </>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Link
            href="/ops/catalog-links"
            className="px-4 py-2 text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || !formData.retailerId}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Create Catalog Link
          </button>
        </div>
      </form>

      {/* New Retailer Modal */}
      {showNewRetailerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">New Retailer</h3>
              <button
                onClick={() => setShowNewRetailerModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRetailer} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newRetailerData.name}
                  onChange={e => setNewRetailerData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Green Valley Dispensary"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={newRetailerData.contactPhone}
                  onChange={e => setNewRetailerData(prev => ({ ...prev, contactPhone: e.target.value }))}
                  placeholder="(555) 123-4567"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email (optional)
                </label>
                <input
                  type="email"
                  value={newRetailerData.contactEmail}
                  onChange={e => setNewRetailerData(prev => ({ ...prev, contactEmail: e.target.value }))}
                  placeholder="contact@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address (optional)
                </label>
                <input
                  type="text"
                  value={newRetailerData.shippingAddress}
                  onChange={e => setNewRetailerData(prev => ({ ...prev, shippingAddress: e.target.value }))}
                  placeholder="123 Main St, City, State"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={newRetailerData.notes}
                  onChange={e => setNewRetailerData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any additional notes about this retailer..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewRetailerModal(false)}
                  className="px-4 py-2 text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newRetailerSubmitting || !newRetailerData.name || !newRetailerData.contactPhone}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {newRetailerSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Retailer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
