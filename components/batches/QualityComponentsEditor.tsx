'use client';

import { useState } from 'react';

interface ActiveComponent {
  name: string;
  level: 'high' | 'moderate' | 'present' | 'trace';
}

interface Props {
  initialComponents: ActiveComponent[];
}

const LEVEL_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'present', label: 'Present' },
  { value: 'trace', label: 'Trace' },
];

export default function QualityComponentsEditor({ initialComponents }: Props) {
  const [components, setComponents] = useState<ActiveComponent[]>(initialComponents);
  const [newName, setNewName] = useState('');
  const [newLevel, setNewLevel] = useState<ActiveComponent['level']>('present');

  const addComponent = () => {
    if (newName.trim() && components.length < 10) {
      setComponents([...components, { name: newName.trim(), level: newLevel }]);
      setNewName('');
      setNewLevel('present');
    }
  };

  const removeComponent = (index: number) => {
    setComponents(components.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addComponent();
    }
  };

  return (
    <div>
      {/* Hidden input to pass JSON to form */}
      <input
        type="hidden"
        name="activeComponents"
        value={JSON.stringify(components)}
      />

      {/* Current components */}
      {components.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {components.map((comp, index) => (
            <div
              key={index}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100"
            >
              <span className="font-medium">{comp.name}</span>
              <span className="mx-1.5 text-gray-300">|</span>
              <span className="text-xs text-gray-600 capitalize">{comp.level}</span>
              <button
                type="button"
                onClick={() => removeComponent(index)}
                className="ml-2 text-gray-400 hover:text-red-500"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new component */}
      {components.length < 10 && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Component name (e.g., Beta-Glucans)"
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
          <select
            value={newLevel}
            onChange={(e) => setNewLevel(e.target.value as ActiveComponent['level'])}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            {LEVEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={addComponent}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Add
          </button>
        </div>
      )}

      {components.length >= 10 && (
        <p className="text-xs text-amber-600">Maximum 10 components reached</p>
      )}
    </div>
  );
}
