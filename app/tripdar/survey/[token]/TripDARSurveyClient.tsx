'use client';

/**
 * Client component wrapper for TripDAR survey
 * Handles mode selection and survey rendering
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExperienceSurvey } from '@/components/experience';
import { ExperienceMode } from '@prisma/client';

interface TripDARSurveyClientProps {
  token: string;
  productName?: string;
  productId: string;
  defaultMode: ExperienceMode;
  hasMicro: boolean;
  hasMacro: boolean;
}

export function TripDARSurveyClient({
  token,
  productName,
  productId,
  defaultMode,
  hasMicro,
  hasMacro
}: TripDARSurveyClientProps) {
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<ExperienceMode | null>(null);
  const [showSurvey, setShowSurvey] = useState(false);

  // Determine if mode selector is needed
  const needsModeSelection = hasMicro && hasMacro;
  const lockedMode = needsModeSelection ? null : (hasMicro ? 'MICRO' : hasMacro ? 'MACRO' : defaultMode);

  const handleComplete = () => {
    // Navigate back to seal page after survey completion
    router.push(`/seal/${token}`);
  };

  const handleCancel = () => {
    // Navigate back to seal page if survey is cancelled
    router.push(`/seal/${token}`);
  };

  // Mode selection step (only if both profiles exist)
  if (needsModeSelection && !selectedMode && !showSurvey) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 space-y-4">
          <h1 className="text-xl font-bold text-gray-900">How did you use it?</h1>
          <p className="text-sm text-gray-600">
            This product has predictions for both microdose and macro journey experiences. 
            Which one did you try?
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setSelectedMode('MICRO');
                setShowSurvey(true);
              }}
              className="w-full px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-left"
            >
              <div className="font-semibold">Microdose</div>
              <div className="text-sm text-blue-100">Subtle, functional enhancement</div>
            </button>
            <button
              onClick={() => {
                setSelectedMode('MACRO');
                setShowSurvey(true);
              }}
              className="w-full px-6 py-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-left"
            >
              <div className="font-semibold">Macro Journey</div>
              <div className="text-sm text-purple-100">Full experience, deeper exploration</div>
            </button>
          </div>
          <button
            onClick={handleCancel}
            className="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (showSurvey || !needsModeSelection) {
    const experienceMode = selectedMode || lockedMode || defaultMode;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <ExperienceSurvey
            token={token}
            productName={productName}
            experienceMode={experienceMode}
            onComplete={handleComplete}
            onCancel={handleCancel}
          />
        </div>
      </div>
    );
  }

  return null;
}

