'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ScopeSelector, { ProductItem, BatchItem } from './ScopeSelector';
import { Check, Loader2, X } from 'lucide-react';

interface CreateRuleFormProps {
  products: ProductItem[];
  recentBatches: BatchItem[];
  plannedBatches: BatchItem[];
}

interface BulkCreateResult {
  created: number;
  skipped: number;
  skippedItems: string[];
  errors: string[];
}

export default function CreateRuleForm({
  products,
  recentBatches,
  plannedBatches,
}: CreateRuleFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<BulkCreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setResult(null);

    const formData = new FormData(e.currentTarget);
    const scopeType = formData.get('scopeType') as string;
    const entityIdsJson = formData.get('entityIds') as string;
    const redirectUrl = formData.get('redirectUrl') as string;
    const reason = formData.get('reason') as string;
    const startsAt = formData.get('startsAt') as string;
    const endsAt = formData.get('endsAt') as string;

    // Parse entity IDs
    let entityIds: string[] = [];
    try {
      entityIds = JSON.parse(entityIdsJson || '[]');
    } catch {
      setError('Invalid selection data');
      setIsSubmitting(false);
      return;
    }

    if (entityIds.length === 0) {
      setError('Please select at least one item');
      setIsSubmitting(false);
      return;
    }

    if (!redirectUrl) {
      setError('Redirect URL is required');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/qr-redirects/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scopeType,
          entityIds,
          redirectUrl,
          reason: reason || undefined,
          startsAt: startsAt || undefined,
          endsAt: endsAt || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create redirect rules');
      }

      setResult(data);

      // If all rules were created successfully, redirect after a short delay
      if (data.created > 0 && data.skipped === 0 && data.errors.length === 0) {
        setTimeout(() => {
          router.push('/ops/qr-redirects');
          router.refresh();
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const dismissResult = () => {
    setResult(null);
    if (result && result.created > 0) {
      router.push('/ops/qr-redirects');
      router.refresh();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6 space-y-6">
      {/* Result Banner */}
      {result && (
        <div className={`rounded-lg p-4 ${result.errors.length > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {result.errors.length === 0 ? (
                <Check className="w-5 h-5 text-green-600 mt-0.5" />
              ) : (
                <svg className="w-5 h-5 text-amber-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              )}
              <div>
                <p className={`text-sm font-medium ${result.errors.length === 0 ? 'text-green-800' : 'text-amber-800'}`}>
                  Redirect rules created: {result.created}
                  {result.skipped > 0 && ` · Skipped: ${result.skipped}`}
                </p>
                {result.skippedItems.length > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    Skipped items (already have active rules): {
                      result.skippedItems.length <= 3
                        ? result.skippedItems.join(', ')
                        : `${result.skippedItems.slice(0, 3).join(', ')}, +${result.skippedItems.length - 3} more`
                    }
                  </p>
                )}
                {result.errors.length > 0 && (
                  <p className="text-xs text-red-700 mt-1">
                    Errors: {result.errors.join('; ')}
                  </p>
                )}
                {result.created > 0 && result.skipped === 0 && result.errors.length === 0 && (
                  <p className="text-xs text-green-600 mt-1">
                    Redirecting to rules list...
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={dismissResult}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <X className="w-5 h-5 text-red-600 mt-0.5" />
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Visual Scope Selector (Phase 7.1 + 7.2) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          What should this rule affect? <span className="text-red-500">*</span>
        </label>
        <ScopeSelector
          products={products}
          recentBatches={recentBatches}
          plannedBatches={plannedBatches}
        />
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-sm font-medium text-gray-900 mb-4">Redirect Settings</h2>
      </div>

      {/* Redirect URL */}
      <div>
        <label htmlFor="redirectUrl" className="block text-sm font-medium text-gray-700">
          Redirect URL <span className="text-red-500">*</span>
        </label>
        <input
          type="url"
          name="redirectUrl"
          id="redirectUrl"
          required
          placeholder="https://example.com/promo"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Where should QR scans redirect to? Must be a valid URL.
        </p>
      </div>

      {/* Reason */}
      <div>
        <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
          Reason
        </label>
        <input
          type="text"
          name="reason"
          id="reason"
          placeholder="e.g., Summer campaign, Product recall, Updated information"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Optional. Document why this redirect exists for audit purposes.
        </p>
      </div>

      {/* Time Window */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label htmlFor="startsAt" className="block text-sm font-medium text-gray-700">
            Start Date/Time
          </label>
          <input
            type="datetime-local"
            name="startsAt"
            id="startsAt"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Optional. Leave empty to start immediately.
          </p>
        </div>
        <div>
          <label htmlFor="endsAt" className="block text-sm font-medium text-gray-700">
            End Date/Time
          </label>
          <input
            type="datetime-local"
            name="endsAt"
            id="endsAt"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Optional. Leave empty for no expiration.
          </p>
        </div>
      </div>

      {/* Warning about existing rules */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex">
          <svg className="h-5 w-5 text-amber-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div className="text-sm text-amber-800">
            <strong>Note:</strong> Only one active rule can exist per item. Items with existing active rules will be skipped during bulk creation.
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Link
          href="/ops/qr-redirects"
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSubmitting ? 'Creating...' : 'Create Rule'}
        </button>
      </div>
    </form>
  );
}

