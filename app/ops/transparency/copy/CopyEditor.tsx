'use client';

/**
 * Copy Editor Component
 * 
 * Allows editing of public-facing copy for transparency pages.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, CheckCircle, Clock, XCircle, Leaf, Shield } from 'lucide-react';

interface CopyEditorProps {
  initialCopy: {
    TRANSPARENCY_PASS_COPY: string;
    TRANSPARENCY_PENDING_COPY: string;
    TRANSPARENCY_FAIL_COPY: string;
    TRANSPARENCY_RAW_MATERIAL_COPY: string;
    TRANSPARENCY_FOOTER_COPY: string;
  };
}

export default function CopyEditor({ initialCopy }: CopyEditorProps) {
  const router = useRouter();
  const [copy, setCopy] = useState(initialCopy);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(key: keyof typeof copy, value: string) {
    setCopy({ ...copy, [key]: value });
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch('/api/transparency/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(copy),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save copy');
      }

      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          Changes saved successfully
        </div>
      )}

      {/* Test Result Copy */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-medium text-gray-900">Test Result Messages</h2>
        <p className="text-sm text-gray-500">
          These messages appear on the public transparency page based on the test result.
        </p>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
            <CheckCircle className="w-4 h-4 text-green-600" />
            PASS Message
          </label>
          <textarea
            value={copy.TRANSPARENCY_PASS_COPY}
            onChange={(e) => handleChange('TRANSPARENCY_PASS_COPY', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
            <Clock className="w-4 h-4 text-yellow-600" />
            PENDING Message
          </label>
          <textarea
            value={copy.TRANSPARENCY_PENDING_COPY}
            onChange={(e) => handleChange('TRANSPARENCY_PENDING_COPY', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
            <XCircle className="w-4 h-4 text-red-600" />
            FAIL Message
            <span className="text-xs text-gray-400">(admin-only state, not shown publicly)</span>
          </label>
          <textarea
            value={copy.TRANSPARENCY_FAIL_COPY}
            onChange={(e) => handleChange('TRANSPARENCY_FAIL_COPY', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            This message is stored for future use (e.g., recall notices) but is not currently displayed publicly.
          </p>
        </div>
      </div>

      {/* Additional Copy */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-medium text-gray-900">Additional Information</h2>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
            <Leaf className="w-4 h-4 text-green-600" />
            Raw Material Explanation
          </label>
          <textarea
            value={copy.TRANSPARENCY_RAW_MATERIAL_COPY}
            onChange={(e) => handleChange('TRANSPARENCY_RAW_MATERIAL_COPY', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Displayed when raw materials are linked and verified.
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
            <Shield className="w-4 h-4 text-blue-600" />
            Footer Trust Statement
          </label>
          <textarea
            value={copy.TRANSPARENCY_FOOTER_COPY}
            onChange={(e) => handleChange('TRANSPARENCY_FOOTER_COPY', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Displayed at the bottom of every transparency page.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

