'use client';

import { useState, useEffect } from 'react';
import { PrivacyDisclosure } from './PrivacyDisclosure';
import { VibeSlider } from './VibeSlider';
import { ExperienceMode } from '@prisma/client';
import { getVibeLabels } from '@/lib/services/vibeVocabularyService';

interface ExperienceSurveyProps {
  token: string;
  productName?: string;
  experienceMode: ExperienceMode;
  onComplete: () => void;
  onCancel: () => void;
}

export function ExperienceSurvey({ token, productName, experienceMode, onComplete, onCancel }: ExperienceSurveyProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vibeLabels, setVibeLabels] = useState<Awaited<ReturnType<typeof getVibeLabels>> | null>(null);
  
  // Load mode-specific vibe labels
  useEffect(() => {
    getVibeLabels(experienceMode).then(setVibeLabels).catch(console.error);
  }, [experienceMode]);
  
  // Form state
  const [overallMatch, setOverallMatch] = useState<number | null>(null);
  const [deltas, setDeltas] = useState<{
    transcend: number | null;
    energize: number | null;
    create: number | null;
    transform: number | null;
    connect: number | null;
  }>({
    transcend: null,
    energize: null,
    create: null,
    transform: null,
    connect: null
  });
  const [context, setContext] = useState<{
    isFirstTime: boolean | null;
    doseBandGrams: string | null;
    doseRelative: string | null;
    setting: string | null;
  }>({
    isFirstTime: null,
    doseBandGrams: null,
    doseRelative: null,
    setting: null
  });
  const [note, setNote] = useState('');
  
  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/experience/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token,
          experienceMode,
          overallMatch,
          deltas,
          context,
          note: note.trim() || null
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit review');
      }
      
      setStep(6); // Thank you step
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  const handleNext = () => {
    if (step < 5) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };
  
  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };
  
  return (
    <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6 space-y-6">
      {/* Step 1: Privacy Disclosure */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900">Share Your Experience</h2>
          {productName && (
            <p className="text-gray-600">Tell us about your experience with <strong>{productName}</strong></p>
          )}
          <PrivacyDisclosure />
          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}
      
      {/* Step 2: Overall Match */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Overall Experience</h2>
          <p className="text-gray-600">
            How well did your actual experience match what you expected?
          </p>
          
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map(value => (
              <button
                key={value}
                type="button"
                onClick={() => setOverallMatch(value)}
                className={`w-full px-4 py-3 rounded-lg text-left transition-colors ${
                  overallMatch === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {value === 0 && 'Very different'}
                {value === 1 && 'Somewhat different'}
                {value === 2 && 'Neutral / As expected'}
                {value === 3 && 'Mostly matched'}
                {value === 4 && 'Exactly as expected'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOverallMatch(null)}
              className={`w-full px-4 py-3 rounded-lg text-left transition-colors ${
                overallMatch === null
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              Skip this question
            </button>
          </div>
          
          <div className="flex justify-between gap-3">
            <button
              onClick={handleBack}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
      
      {/* Step 3: Vibe Deltas */}
      {step === 3 && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-gray-900">Vibe Comparison</h2>
          <p className="text-gray-600">
            Compared to what was predicted, how did each vibe feel?
          </p>
          
          <div className="space-y-6">
            <VibeSlider
              label={vibeLabels?.transcend || 'Transcend'}
              value={deltas.transcend}
              onChange={(value) => setDeltas({ ...deltas, transcend: value })}
            />
            <VibeSlider
              label={vibeLabels?.energize || 'Energize'}
              value={deltas.energize}
              onChange={(value) => setDeltas({ ...deltas, energize: value })}
            />
            <VibeSlider
              label={vibeLabels?.create || 'Create'}
              value={deltas.create}
              onChange={(value) => setDeltas({ ...deltas, create: value })}
            />
            <VibeSlider
              label={vibeLabels?.transform || 'Transform'}
              value={deltas.transform}
              onChange={(value) => setDeltas({ ...deltas, transform: value })}
            />
            <VibeSlider
              label={vibeLabels?.connect || 'Connect'}
              value={deltas.connect}
              onChange={(value) => setDeltas({ ...deltas, connect: value })}
            />
          </div>
          
          <div className="flex justify-between gap-3">
            <button
              onClick={handleBack}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
      
      {/* Step 4: Context */}
      {step === 4 && (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-gray-900">Context (Optional)</h2>
          <p className="text-gray-600">
            Help us understand your experience better. All questions are optional.
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Was this your first time trying this product?
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setContext({ ...context, isFirstTime: true })}
                  className={`px-4 py-2 rounded-lg ${
                    context.isFirstTime === true
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setContext({ ...context, isFirstTime: false })}
                  className={`px-4 py-2 rounded-lg ${
                    context.isFirstTime === false
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => setContext({ ...context, isFirstTime: null })}
                  className={`px-4 py-2 rounded-lg ${
                    context.isFirstTime === null
                      ? 'bg-gray-200 text-gray-700'
                      : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  Skip
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dose (grams)
              </label>
              <select
                value={context.doseBandGrams || ''}
                onChange={(e) => setContext({ ...context, doseBandGrams: e.target.value || null })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select or skip</option>
                <option value="0-0.25g">0 - 0.25g</option>
                <option value="0.25-0.75g">0.25 - 0.75g</option>
                <option value="0.75-1.5g">0.75 - 1.5g</option>
                <option value="1.5-3g">1.5 - 3g</option>
                <option value="3g+">3g+</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dose relative to your typical
              </label>
              <select
                value={context.doseRelative || ''}
                onChange={(e) => setContext({ ...context, doseRelative: e.target.value || null })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select or skip</option>
                <option value="less">Less than usual</option>
                <option value="typical">Typical</option>
                <option value="more">More than usual</option>
                <option value="first_time">First time / No baseline</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Setting
              </label>
              <select
                value={context.setting || ''}
                onChange={(e) => setContext({ ...context, setting: e.target.value || null })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select or skip</option>
                <option value="solo">Solo</option>
                <option value="social">Social</option>
                <option value="nature">Nature / Outdoors</option>
                <option value="ceremony">Ceremony / Intentional</option>
                <option value="work">Work / Creative</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
          </div>
          
          <div className="flex justify-between gap-3">
            <button
              onClick={handleBack}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleNext}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
      
      {/* Step 5: Note */}
      {step === 5 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Additional Notes (Optional)</h2>
          <p className="text-gray-600">
            Share any additional thoughts about your experience. (280-500 characters)
          </p>
          
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={6}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none"
            placeholder="Your thoughts..."
          />
          <p className="text-sm text-gray-500 text-right">
            {note.length} / 500 characters
          </p>
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          
          <div className="flex justify-between gap-3">
            <button
              onClick={handleBack}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      )}
      
      {/* Step 6: Thank You */}
      {step === 6 && (
        <div className="text-center space-y-4 py-8">
          <div className="text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-900">Thank You!</h2>
          <p className="text-gray-600">
            Your feedback helps us improve our products and predictions.
          </p>
          <button
            onClick={onComplete}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

