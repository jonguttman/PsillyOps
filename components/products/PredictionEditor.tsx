'use client';

import { useState, useEffect } from 'react';
// NOTE: Only import TYPES from @prisma/client (these are tree-shaken and safe for client)
import type { ExperienceMode, PredictionProfile } from '@prisma/client';

// Define VibeWeights locally to avoid importing from predictionService (which imports Prisma)
export interface VibeWeights {
  transcend: number;
  energize: number;
  create: number;
  transform: number;
  connect: number;
}

// Define VibeLabels locally to avoid importing from vibeVocabularyService (which imports Prisma)
interface VibeLabels {
  transcend: string;
  energize: string;
  create: string;
  transform: string;
  connect: string;
}

// Default vocabulary mappings (duplicated from vibeVocabularyService for client-side use)
const DEFAULT_VOCABULARY: Record<ExperienceMode, VibeLabels> = {
  MICRO: {
    transcend: 'Subtle uplift',
    energize: 'Clarity / energy',
    create: 'Creative flow',
    transform: 'Perspective shift',
    connect: 'Emotional openness'
  },
  MACRO: {
    transcend: 'Mystical / beyond-self',
    energize: 'Stimulation / intensity',
    create: 'Visionary / imagination',
    transform: 'Breakthrough / dissolution',
    connect: 'Connection / unity'
  }
};

interface PredictionEditorProps {
  productId: string;
  defaultMode: ExperienceMode;
  initialPredictions: Record<ExperienceMode, PredictionProfile | null>;
  onSave: (weights: VibeWeights, experienceMode: ExperienceMode) => Promise<void>;
}

export function PredictionEditor({ 
  productId, 
  defaultMode, 
  initialPredictions, 
  onSave 
}: PredictionEditorProps) {
  const [currentMode, setCurrentMode] = useState<ExperienceMode>(defaultMode);
  // Use default vocabulary directly (no async fetch needed for defaults)
  const vibeLabels = DEFAULT_VOCABULARY;
  const [weights, setWeights] = useState<VibeWeights>(() => {
    const profile = initialPredictions[currentMode];
    return {
      transcend: profile?.transcend || 0,
      energize: profile?.energize || 0,
      create: profile?.create || 0,
      transform: profile?.transform || 0,
      connect: profile?.connect || 0
    };
  });
  
  const [sum, setSum] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update weights when mode changes
  useEffect(() => {
    const profile = initialPredictions[currentMode];
    setWeights({
      transcend: profile?.transcend || 0,
      energize: profile?.energize || 0,
      create: profile?.create || 0,
      transform: profile?.transform || 0,
      connect: profile?.connect || 0
    });
  }, [currentMode, initialPredictions]);

  useEffect(() => {
    const total = weights.transcend + weights.energize + weights.create + weights.transform + weights.connect;
    setSum(total);
  }, [weights]);
  
  const updateWeight = (vibe: keyof VibeWeights, value: number) => {
    setWeights(prev => ({
      ...prev,
      [vibe]: Math.max(0, Math.min(1, value))
    }));
  };

  const handleModeChange = (mode: ExperienceMode) => {
    setCurrentMode(mode);
    setError(null);
  };
  
  const handleSave = async () => {
    setError(null);
    
    // Validate sum
    const total = weights.transcend + weights.energize + weights.create + weights.transform + weights.connect;
    const diff = Math.abs(total - 1.0);
    
    if (diff > 0.01) {
      setError(`Weights must sum to 1.0 (current: ${total.toFixed(3)})`);
      return;
    }
    
    setSaving(true);
    try {
      await onSave(weights, currentMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prediction');
    } finally {
      setSaving(false);
    }
  };
  
  const isValid = Math.abs(sum - 1.0) <= 0.01;
  const currentLabels = vibeLabels[currentMode];
  const hasProfile = !!initialPredictions[currentMode];
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Predicted Experience</h3>
        <span className={`text-sm font-medium ${isValid ? 'text-green-600' : 'text-red-600'}`}>
          Sum: {sum.toFixed(3)} / 1.0
        </span>
      </div>

      {/* Mode Toggle */}
      <div className="flex items-center gap-4 border-b pb-4">
        <span className="text-sm font-medium text-gray-700">Expected Experience:</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleModeChange('MICRO')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentMode === 'MICRO'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            MICRO
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('MACRO')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentMode === 'MACRO'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            MACRO
          </button>
        </div>
        {hasProfile && (
          <span className="text-xs text-gray-500 ml-auto">
            Profile exists for {currentMode}
          </span>
        )}
      </div>
      
      <div className="space-y-4">
        <VibeSlider
          label={currentLabels.transcend}
          value={weights.transcend}
          onChange={(value) => updateWeight('transcend', value)}
        />
        <VibeSlider
          label={currentLabels.energize}
          value={weights.energize}
          onChange={(value) => updateWeight('energize', value)}
        />
        <VibeSlider
          label={currentLabels.create}
          value={weights.create}
          onChange={(value) => updateWeight('create', value)}
        />
        <VibeSlider
          label={currentLabels.transform}
          value={weights.transform}
          onChange={(value) => updateWeight('transform', value)}
        />
        <VibeSlider
          label={currentLabels.connect}
          value={weights.connect}
          onChange={(value) => updateWeight('connect', value)}
        />
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      
      <button
        onClick={handleSave}
        disabled={!isValid || saving}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? 'Saving...' : `Save ${currentMode} Prediction Profile`}
      </button>
      
      <p className="text-xs text-gray-500">
        Prediction profiles are immutable snapshots. Saving creates a new profile version for {currentMode} mode.
      </p>
    </div>
  );
}

function VibeSlider({ 
  label, 
  value, 
  onChange 
}: { 
  label: string; 
  value: number; 
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="text-sm text-gray-500">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-gray-400">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}
