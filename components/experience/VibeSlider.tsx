'use client';

import { useState } from 'react';

export interface VibeDelta {
  value: number | null; // -2 to +2, or null for "not sure"
}

interface VibeSliderProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}

export function VibeSlider({ label, value, onChange }: VibeSliderProps) {
  const [localValue, setLocalValue] = useState<number | null>(value);
  
  const handleChange = (newValue: number | null) => {
    setLocalValue(newValue);
    onChange(newValue);
  };
  
  const options = [
    { label: 'Much less', value: -2 },
    { label: 'Less', value: -1 },
    { label: 'Same', value: 0 },
    { label: 'More', value: 1 },
    { label: 'Much more', value: 2 },
    { label: 'Not sure', value: null }
  ];
  
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      
      <div className="flex flex-wrap gap-2">
        {options.map(option => (
          <button
            key={option.value ?? 'null'}
            type="button"
            onClick={() => handleChange(option.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              localValue === option.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

