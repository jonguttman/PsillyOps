'use client';

// Default Redirect Panel
// Configuration panel for the system-level fallback redirect
// Used only when no product or batch redirect rule matches

import { useState, useTransition } from 'react';
import { ExternalLink, Info, Save, Loader2, Check, AlertCircle, Power } from 'lucide-react';

interface FallbackRedirect {
  id: string;
  redirectUrl: string;
  reason: string | null;
  active: boolean;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  createdAt: Date | string;
  updatedAt?: Date | string;
  createdBy?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
}

interface Props {
  initialFallback: FallbackRedirect | null;
}

export default function DefaultRedirectPanel({ initialFallback }: Props) {
  const [isPending, startTransition] = useTransition();
  const [fallback, setFallback] = useState<FallbackRedirect | null>(initialFallback);
  
  // Form state
  const [redirectUrl, setRedirectUrl] = useState(initialFallback?.redirectUrl || '');
  const [reason, setReason] = useState(initialFallback?.reason || '');
  const [active, setActive] = useState(initialFallback?.active ?? true);
  const [startsAt, setStartsAt] = useState(
    initialFallback?.startsAt 
      ? new Date(initialFallback.startsAt).toISOString().slice(0, 16) 
      : ''
  );
  const [endsAt, setEndsAt] = useState(
    initialFallback?.endsAt 
      ? new Date(initialFallback.endsAt).toISOString().slice(0, 16) 
      : ''
  );
  
  // UI state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Validate URL on blur
  const validateUrl = (url: string) => {
    if (!url) {
      setUrlError(null);
      return;
    }
    try {
      new URL(url);
      setUrlError(null);
    } catch {
      setUrlError('Please enter a valid URL (e.g., https://example.com)');
    }
  };

  // Check if form has changes
  const hasChanges = 
    redirectUrl !== (fallback?.redirectUrl || '') ||
    reason !== (fallback?.reason || '') ||
    active !== (fallback?.active ?? true) ||
    startsAt !== (fallback?.startsAt ? new Date(fallback.startsAt).toISOString().slice(0, 16) : '') ||
    endsAt !== (fallback?.endsAt ? new Date(fallback.endsAt).toISOString().slice(0, 16) : '');

  const handleSave = () => {
    if (!redirectUrl) {
      setError('Redirect URL is required');
      return;
    }

    if (urlError) {
      return;
    }

    setError(null);
    setSuccess(false);

    startTransition(async () => {
      try {
        const response = await fetch('/api/qr-redirects/fallback', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            redirectUrl,
            reason: reason || null,
            active,
            startsAt: startsAt || null,
            endsAt: endsAt || null
          })
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to save');
        }

        const data = await response.json();
        setFallback(data.fallback);
        setSuccess(true);
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save');
      }
    });
  };

  const handleToggleActive = () => {
    setActive(!active);
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      {/* Panel Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Default Redirect</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Fallback destination when no product or batch rule matches
            </p>
          </div>
          
          {/* Active Toggle */}
          <button
            type="button"
            onClick={handleToggleActive}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              active
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <Power className="w-4 h-4" />
            {active ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-700">
            <p>
              This redirect is used <strong>only</strong> when a QR scan does not match any 
              product-specific or batch-specific redirect rule.
            </p>
            <p className="mt-1 text-blue-600">
              Resolution order: Batch → Product → <strong>Default Redirect</strong> → No redirect
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="p-6 space-y-5">
        {/* Redirect URL */}
        <div>
          <label htmlFor="redirectUrl" className="block text-sm font-medium text-gray-700 mb-1">
            Redirect URL <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="url"
              id="redirectUrl"
              value={redirectUrl}
              onChange={(e) => setRedirectUrl(e.target.value)}
              onBlur={(e) => validateUrl(e.target.value)}
              placeholder="https://example.com/landing"
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                urlError ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {redirectUrl && !urlError && (
              <a
                href={redirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-blue-600"
                title="Open URL"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
          {urlError && (
            <p className="mt-1 text-sm text-red-600">{urlError}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Where unmatched QR scans will be redirected
          </p>
        </div>

        {/* Reason */}
        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
            Reason / Note
          </label>
          <input
            type="text"
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Main landing page, Support page"
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Optional note for audit purposes
          </p>
        </div>

        {/* Time Window (collapsible) */}
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 list-none flex items-center gap-1">
            <span className="text-gray-400 group-open:rotate-90 transition-transform">▶</span>
            Schedule (optional)
          </summary>
          <div className="mt-3 pl-4 grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startsAt" className="block text-sm text-gray-600 mb-1">
                Start Date
              </label>
              <input
                type="datetime-local"
                id="startsAt"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
            <div>
              <label htmlFor="endsAt" className="block text-sm text-gray-600 mb-1">
                End Date
              </label>
              <input
                type="datetime-local"
                id="endsAt"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
          </div>
        </details>

        {/* Error/Success Messages */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
            <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-700">Default redirect saved successfully</p>
          </div>
        )}

        {/* Save Button */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-gray-400">
            {fallback?.updatedAt && (
              <>Last updated: {new Date(fallback.updatedAt).toLocaleString()}</>
            )}
            {!fallback?.updatedAt && fallback?.createdAt && (
              <>Created: {new Date(fallback.createdAt).toLocaleString()}</>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !redirectUrl || !!urlError || !hasChanges}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status Footer */}
      {!active && fallback && (
        <div className="px-6 py-3 bg-amber-50 border-t border-amber-100">
          <p className="text-sm text-amber-700">
            ⚠️ Default redirect is currently <strong>disabled</strong>. 
            Unmatched QR scans will use the system default behavior.
          </p>
        </div>
      )}
    </div>
  );
}

