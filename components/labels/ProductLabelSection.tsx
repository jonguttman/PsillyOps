'use client';

/**
 * ProductLabelSection
 * 
 * Combines label selection (Product Settings) with print action (Print Labels).
 * UX Rule: "what am I printing" lives here, "how am I printing" lives in PrintLabelButton modal.
 */

import { useState, useEffect } from 'react';
import PrintLabelButton from './PrintLabelButton';

interface LabelVersion {
  id: string;
  version: string;
  isActive: boolean;
  notes: string | null;
}

interface LabelTemplate {
  id: string;
  name: string;
  entityType: string;
  versions: LabelVersion[];
}

interface ProductLabelSectionProps {
  entityType: 'PRODUCT' | 'BATCH' | 'INVENTORY';
  entityId: string;
  entityCode: string;
}

export default function ProductLabelSection({
  entityType,
  entityId,
  entityCode
}: ProductLabelSectionProps) {
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/labels/templates?entityType=${entityType}`);
        const data = await response.json();

        if (response.ok) {
          setTemplates(data.templates || []);

          // Auto-select active version
          const activeVersion = data.templates
            ?.flatMap((t: LabelTemplate) => t.versions)
            ?.find((v: LabelVersion) => v.isActive);
          
          if (activeVersion) {
            setSelectedVersionId(activeVersion.id);
          }
        }
      } catch {
        // Silent fail - label selection is optional
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplates();
  }, [entityType]);

  const allVersions = templates.flatMap(t => 
    t.versions.map(v => ({
      ...v,
      templateName: t.name
    }))
  );

  const selectedLabel = allVersions.find(v => v.id === selectedVersionId);

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4">Label Settings</h2>
      
      <div className="space-y-4">
        {/* Label Selection - "what am I printing" */}
        <div>
          <label htmlFor="labelVersion" className="block text-sm font-medium text-gray-700 mb-1">
            Label Template
          </label>
          {isLoading ? (
            <div className="text-sm text-gray-500">Loading labels...</div>
          ) : allVersions.length === 0 ? (
            <div className="text-sm text-gray-500">
              No label templates available.{' '}
              <a href="/labels" className="text-blue-600 hover:underline">
                Create one
              </a>
            </div>
          ) : (
            <select
              id="labelVersion"
              value={selectedVersionId}
              onChange={(e) => setSelectedVersionId(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">Select a label...</option>
              {allVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.templateName} v{v.version} {v.isActive ? '(Active)' : ''}
                </option>
              ))}
            </select>
          )}
          {selectedLabel && (
            <p className="mt-1 text-xs text-gray-500">
              {selectedLabel.notes || 'No notes'}
            </p>
          )}
        </div>

        {/* Print Action - "how am I printing" handled inside PrintLabelButton */}
        <div className="pt-2">
          <PrintLabelButton
            entityType={entityType}
            entityId={entityId}
            entityCode={entityCode}
            selectedVersionId={selectedVersionId}
            className={!selectedVersionId ? 'opacity-50 cursor-not-allowed' : ''}
          />
          {!selectedVersionId && (
            <p className="mt-1 text-xs text-gray-500">
              Select a label template above to enable printing
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

