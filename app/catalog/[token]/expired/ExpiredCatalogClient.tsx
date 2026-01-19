'use client';

import { useState } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

interface ExpiredCatalogClientProps {
  token: string;
  retailerId: string | null;
  retailerName: string | null;
}

export function ExpiredCatalogClient({
  token,
  retailerId,
  retailerName
}: ExpiredCatalogClientProps) {
  const [formData, setFormData] = useState({
    name: '',
    store: '',
    emailOrPhone: '',
    note: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/catalog/${token}/renewal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          store: formData.store,
          emailOrPhone: formData.emailOrPhone,
          note: formData.note || undefined
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to submit request');
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // Success state
  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center py-16">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-6" />
          <p className="text-xl text-gray-900 mb-2">Request received.</p>
          <p className="text-gray-600">We'll follow up directly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-lg w-full py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">
            This introduction has concluded.
          </h1>
          <p className="text-gray-600 leading-relaxed">
            Access to this portal is shared intentionally.
          </p>
          <p className="text-gray-600 leading-relaxed mt-4">
            If you'd like to continue the conversation, you can request a renewed introduction below.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-shadow"
            />
          </div>

          <div>
            <label htmlFor="store" className="block text-sm font-medium text-gray-700 mb-1">
              Store
            </label>
            <input
              type="text"
              id="store"
              required
              value={formData.store}
              onChange={(e) => setFormData({ ...formData, store: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-shadow"
            />
          </div>

          <div>
            <label htmlFor="emailOrPhone" className="block text-sm font-medium text-gray-700 mb-1">
              Email or phone
            </label>
            <input
              type="text"
              id="emailOrPhone"
              required
              value={formData.emailOrPhone}
              onChange={(e) => setFormData({ ...formData, emailOrPhone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-shadow"
            />
          </div>

          <div>
            <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">
              Optional note
            </label>
            <textarea
              id="note"
              rows={3}
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-shadow resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Submitting...' : 'Request renewed access'}
          </button>
        </form>
      </div>
    </div>
  );
}
