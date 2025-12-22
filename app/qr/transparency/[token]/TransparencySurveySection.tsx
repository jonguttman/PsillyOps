'use client';

import { useState } from 'react';
import { ExperienceSurvey, SurveyNudge } from '@/components/experience';
import { MessageSquare } from 'lucide-react';
import { ExperienceMode } from '@prisma/client';

interface TransparencySurveySectionProps {
  token: string;
  productName?: string;
  productId: string;
  defaultMode: ExperienceMode;
  hasMicro: boolean;
  hasMacro: boolean;
}

export function TransparencySurveySection({ 
  token, 
  productName,
  productId,
  defaultMode,
  hasMicro,
  hasMacro
}: TransparencySurveySectionProps) {
  const [showSurvey, setShowSurvey] = useState(false);
  const [showNudge, setShowNudge] = useState(true);
  const [selectedMode, setSelectedMode] = useState<ExperienceMode | null>(null);
  
  // Determine if mode selector is needed
  const needsModeSelection = hasMicro && hasMacro;
  const lockedMode = needsModeSelection ? null : (hasMicro ? 'MICRO' : hasMacro ? 'MACRO' : defaultMode);
  
  // Mode selection step (only if both profiles exist)
  if (needsModeSelection && !selectedMode && !showSurvey) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">How did you use it?</h3>
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
      </div>
    );
  }

  if (showSurvey) {
    const experienceMode = selectedMode || lockedMode || defaultMode;
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <ExperienceSurvey
            token={token}
            productName={productName}
            experienceMode={experienceMode}
            onComplete={() => {
              setShowSurvey(false);
              setSelectedMode(null);
            }}
            onCancel={() => {
              setShowSurvey(false);
              setSelectedMode(null);
            }}
          />
        </div>
      </div>
    );
  }
  
  return (
    <>
      {/* Explicit "Share Your Experience" Button */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <button
          onClick={() => setShowSurvey(true)}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <MessageSquare className="w-5 h-5" />
          Share Your Experience
        </button>
        <p className="text-xs text-gray-500 text-center mt-2">
          Help us improve by sharing how this product matched your expectations
        </p>
      </div>
      
      {/* Soft Nudge (dismissible) */}
      {showNudge && (
        <SurveyNudge
          onDismiss={() => setShowNudge(false)}
          onStart={() => setShowSurvey(true)}
        />
      )}
    </>
  );
}

