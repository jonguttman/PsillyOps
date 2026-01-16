'use client';

import { useState } from 'react';

interface FeedbackFormProps {
  productName: string;
  batchCode: string;
  scanCount?: number;
  verificationDate: string;
}

type FeedbackCategory = 'great_experience' | 'question' | 'issue' | 'suggestion';

const CATEGORIES: { value: FeedbackCategory; label: string; emoji: string; color: string }[] = [
  { value: 'great_experience', label: 'Great Experience', emoji: '🌟', color: '#2d5f3f' },
  { value: 'question', label: 'Question', emoji: '❓', color: '#1976d2' },
  { value: 'issue', label: 'Issue/Problem', emoji: '⚠️', color: '#d32f2f' },
  { value: 'suggestion', label: 'Suggestion', emoji: '💡', color: '#f57c00' },
];

export default function FeedbackForm({
  productName,
  batchCode,
  scanCount,
  verificationDate,
}: FeedbackFormProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<FeedbackCategory | null>(null);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Email is required for questions and issues (so we can follow up)
  const emailRequired = selectedCategory === 'question' || selectedCategory === 'issue';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCategory) return;
    if (emailRequired && !email) return;

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedCategory,
          email,
          message: message.trim() || undefined,
          productName,
          batchCode,
          scanCount,
          verificationDate,
        }),
      });

      if (response.ok) {
        setSubmitStatus('success');
        setSelectedCategory(null);
        setEmail('');
        setMessage('');
      } else {
        setSubmitStatus('error');
      }
    } catch {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitStatus === 'success') {
    return (
      <div className="text-center py-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: 'linear-gradient(135deg, #d4f4dd 0%, #c8edd4 100%)' }}
        >
          <svg className="w-8 h-8" style={{ stroke: '#2d5f3f' }} fill="none" viewBox="0 0 24 24" strokeWidth={2.5}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3
          className="text-lg font-semibold mb-2"
          style={{ fontFamily: 'var(--font-crimson), serif', color: '#1a1a1a' }}
        >
          Thank You!
        </h3>
        <p className="text-sm" style={{ color: '#666666' }}>
          Your feedback has been sent. We appreciate you taking the time to share your experience.
        </p>
      </div>
    );
  }

  return (
    <div>
      {!isExpanded ? (
        <div className="text-center">
          <p className="text-sm mb-3" style={{ color: '#666666' }}>
            Questions or feedback about your product?
          </p>
          <button
            onClick={() => setIsExpanded(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, #fef9f0 0%, #fcf6ec 100%)',
              color: '#2d5f3f',
              border: '1px solid #e8e3d9',
            }}
          >
            Share Your Experience
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: '#1a1a1a' }}>
              What would you like to share?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setSelectedCategory(cat.value)}
                  className="p-3 rounded-lg text-left transition-all"
                  style={{
                    background: selectedCategory === cat.value
                      ? `linear-gradient(135deg, ${cat.color}15 0%, ${cat.color}25 100%)`
                      : '#ffffff',
                    border: selectedCategory === cat.value
                      ? `2px solid ${cat.color}`
                      : '1px solid #e8e3d9',
                  }}
                >
                  <span className="text-lg">{cat.emoji}</span>
                  <span
                    className="block text-xs mt-1 font-medium"
                    style={{ color: selectedCategory === cat.value ? cat.color : '#666666' }}
                  >
                    {cat.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="feedback-email" className="block text-sm font-medium mb-1" style={{ color: '#1a1a1a' }}>
              Your Email {emailRequired ? (
                <span style={{ color: '#d32f2f' }}>*</span>
              ) : (
                <span style={{ color: '#999999' }}>(optional)</span>
              )}
            </label>
            <input
              type="email"
              id="feedback-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required={emailRequired}
              placeholder="you@example.com"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                border: '1px solid #e8e3d9',
                background: '#ffffff',
                color: '#1a1a1a',
              }}
            />
            <p className="text-xs mt-1" style={{ color: '#999999' }}>
              {emailRequired ? 'So we can follow up with you' : 'Optional - include if you\'d like a response'}
            </p>
          </div>

          <div>
            <label htmlFor="feedback-message" className="block text-sm font-medium mb-1" style={{ color: '#1a1a1a' }}>
              Message <span style={{ color: '#999999' }}>(optional)</span>
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Tell us more..."
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{
                border: '1px solid #e8e3d9',
                background: '#ffffff',
                color: '#1a1a1a',
              }}
            />
          </div>

          {submitStatus === 'error' && (
            <div
              className="p-3 rounded-lg text-sm"
              style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}
            >
              Something went wrong. Please try again or email us directly at{' '}
              <a href="mailto:psillyco@proton.me" style={{ textDecoration: 'underline' }}>
                psillyco@proton.me
              </a>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium"
              style={{
                background: '#ffffff',
                color: '#666666',
                border: '1px solid #e8e3d9',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedCategory || (emailRequired && !email) || isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #2d5f3f 0%, #4a7d5e 100%)',
              }}
            >
              {isSubmitting ? 'Sending...' : 'Send Feedback'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
