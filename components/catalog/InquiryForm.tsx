'use client';

import { useState } from 'react';
import { Send, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface InquiryFormProps {
  catalogToken: string;
  catalogLinkId: string;
  productId?: string;
  productName?: string;
  onSuccess?: () => void;
}

export function InquiryForm({
  catalogToken,
  catalogLinkId,
  productId,
  productName,
  onSuccess
}: InquiryFormProps) {
  const [formData, setFormData] = useState({
    contactName: '',
    businessName: '',
    email: '',
    phone: '',
    followUpWith: '',
    message: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/catalog/${catalogToken}/inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          productsOfInterest: productId ? [productId] : undefined
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to submit inquiry');
      }

      setSubmitted(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-green-900 mb-2">Thank you!</h3>
        <p className="text-green-700">
          Your inquiry has been submitted. We'll be in touch soon.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {productName && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 mb-4">
          <p className="text-sm text-indigo-700">
            Inquiring about: <span className="font-medium">{productName}</span>
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Contact Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.contactName}
            onChange={e => setFormData(prev => ({ ...prev, contactName: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            placeholder="John Smith"
          />
        </div>

        {/* Business Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Business Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.businessName}
            onChange={e => setFormData(prev => ({ ...prev, businessName: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            placeholder="Acme Health Store"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            required
            value={formData.email}
            onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            placeholder="john@example.com"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            placeholder="(555) 123-4567"
          />
        </div>
      </div>

      {/* Who to follow up with */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Who should we follow up with?
        </label>
        <input
          type="text"
          value={formData.followUpWith}
          onChange={e => setFormData(prev => ({ ...prev, followUpWith: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          placeholder="Name or department (e.g., Purchasing Manager)"
        />
      </div>

      {/* Message */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Message
        </label>
        <textarea
          rows={4}
          value={formData.message}
          onChange={e => setFormData(prev => ({ ...prev, message: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm resize-none"
          placeholder="Tell us about your needs, order quantities, or any questions..."
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Submit Inquiry
          </>
        )}
      </button>

      <p className="text-xs text-gray-500 text-center">
        By submitting this form, you agree to be contacted about your inquiry.
      </p>
    </form>
  );
}
