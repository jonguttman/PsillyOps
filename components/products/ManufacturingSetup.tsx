'use client';

import { useState } from 'react';
import { PlusIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, GripVerticalIcon } from 'lucide-react';

interface ManufacturingStep {
  key: string;
  label: string;
  order: number;
  required: boolean;
  dependsOnKeys: string[];
  estimatedMinutes?: number;
}

interface ManufacturingSetupProps {
  productId: string;
  initialSteps: ManufacturingStep[];
  initialEquipment: string[];
  onSave: (steps: ManufacturingStep[], equipment: string[]) => Promise<void>;
}

export function ManufacturingSetup({ 
  productId, 
  initialSteps, 
  initialEquipment,
  onSave 
}: ManufacturingSetupProps) {
  const [steps, setSteps] = useState<ManufacturingStep[]>(initialSteps);
  const [equipment, setEquipment] = useState<string[]>(initialEquipment);
  const [newEquipment, setNewEquipment] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addStep = () => {
    const newStep: ManufacturingStep = {
      key: `step_${Date.now()}`,
      label: 'New Step',
      order: steps.length + 1,
      required: true,
      dependsOnKeys: [],
      estimatedMinutes: undefined,
    };
    setSteps([...steps, newStep]);
  };

  const updateStep = (index: number, updates: Partial<ManufacturingStep>) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    setSteps(newSteps);
  };

  const removeStep = (index: number) => {
    const removedKey = steps[index].key;
    const newSteps = steps.filter((_, i) => i !== index);
    // Re-order and remove dependencies on the removed step
    newSteps.forEach((step, i) => {
      step.order = i + 1;
      step.dependsOnKeys = step.dependsOnKeys.filter(k => k !== removedKey);
    });
    setSteps(newSteps);
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === steps.length - 1) return;

    const newSteps = [...steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
    
    // Update order numbers
    newSteps.forEach((step, i) => {
      step.order = i + 1;
    });
    
    setSteps(newSteps);
  };

  const addEquipment = () => {
    if (newEquipment.trim() && !equipment.includes(newEquipment.trim())) {
      setEquipment([...equipment, newEquipment.trim()]);
      setNewEquipment('');
    }
  };

  const removeEquipment = (index: number) => {
    setEquipment(equipment.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave(steps, equipment);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setSteps(initialSteps);
    setEquipment(initialEquipment);
    setIsEditing(false);
    setError(null);
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Manufacturing Setup</h2>
          <p className="text-sm text-gray-500">Define steps and equipment for production runs</p>
        </div>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Required Equipment Section */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Required Equipment</h3>
        {equipment.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-2">
            {equipment.map((item, index) => (
              <span
                key={index}
                className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-800"
              >
                {item}
                {isEditing && (
                  <button
                    onClick={() => removeEquipment(index)}
                    className="ml-2 text-gray-400 hover:text-red-500"
                  >
                    <TrashIcon className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-2">No equipment configured</p>
        )}
        {isEditing && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newEquipment}
              onChange={(e) => setNewEquipment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEquipment())}
              placeholder="Add equipment (e.g., Scale, Mixer)"
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
            <button
              onClick={addEquipment}
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <PlusIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Manufacturing Steps Section */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">Manufacturing Steps</h3>
        {steps.length > 0 ? (
          <div className="space-y-2">
            {steps.map((step, index) => (
              <div
                key={step.key}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
              >
                {isEditing && (
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => moveStep(index, 'up')}
                      disabled={index === 0}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <ArrowUpIcon className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => moveStep(index, 'down')}
                      disabled={index === steps.length - 1}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <ArrowDownIcon className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <span className="text-sm font-medium text-gray-500 w-6">{step.order}.</span>
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={step.label}
                      onChange={(e) => updateStep(index, { label: e.target.value })}
                      className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                    <input
                      type="number"
                      value={step.estimatedMinutes || ''}
                      onChange={(e) => updateStep(index, { estimatedMinutes: e.target.value ? parseInt(e.target.value) : undefined })}
                      placeholder="Min"
                      className="w-16 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                    <label className="flex items-center gap-1 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={step.required}
                        onChange={(e) => updateStep(index, { required: e.target.checked })}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Required
                    </label>
                    <select
                      value={step.dependsOnKeys.join(',')}
                      onChange={(e) => updateStep(index, { 
                        dependsOnKeys: e.target.value ? e.target.value.split(',') : [] 
                      })}
                      className="w-40 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    >
                      <option value="">No dependency</option>
                      {steps.filter((s, i) => i < index).map(s => (
                        <option key={s.key} value={s.key}>After: {s.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeStep(index)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-900">{step.label}</span>
                    {step.estimatedMinutes && (
                      <span className="text-xs text-gray-500">~{step.estimatedMinutes} min</span>
                    )}
                    {step.required && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">Required</span>
                    )}
                    {step.dependsOnKeys.length > 0 && (
                      <span className="text-xs text-gray-500">
                        → After: {steps.find(s => s.key === step.dependsOnKeys[0])?.label}
                      </span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No manufacturing steps configured. Default steps will be used.</p>
        )}
        {isEditing && (
          <button
            onClick={addStep}
            className="mt-3 inline-flex items-center px-3 py-2 border border-dashed border-gray-300 text-sm font-medium rounded-md text-gray-600 hover:border-gray-400 hover:text-gray-700"
          >
            <PlusIcon className="h-4 w-4 mr-1" />
            Add Step
          </button>
        )}
      </div>
    </div>
  );
}

