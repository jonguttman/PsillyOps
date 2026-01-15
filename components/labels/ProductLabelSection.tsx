'use client';

/**
 * ProductLabelSection
 * 
 * Combines label association management with print action (Print Labels).
 * 
 * For PRODUCT entities:
 * - Displays a multi-select checklist to associate label templates with the product
 * - Allows selecting which label is the QR carrier and which is the barcode carrier
 * - Filters the print dropdown to only show associated templates (or all if none associated)
 * 
 * For BATCH/INVENTORY entities:
 * - Shows all active label templates (no association management)
 * 
 * UX Rule: "what am I printing" lives here, "how am I printing" lives in PrintLabelButton modal.
 */

import { useState, useEffect, useCallback } from 'react';
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

interface ProductLabelAssociation {
  templateId: string;
  templateName: string;
  hasActiveVersion: boolean;
  activeVersionIds: string[];
  isQrCarrier: boolean;
  isBarcodeCarrier: boolean;
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
  
  // Product-specific: associated label templates
  const [associations, setAssociations] = useState<ProductLabelAssociation[]>([]);
  const [isLoadingAssociations, setIsLoadingAssociations] = useState(false);
  const [isSavingAssociations, setIsSavingAssociations] = useState(false);
  const [associationError, setAssociationError] = useState<string | null>(null);

  // Fetch all label templates for the entity type
  useEffect(() => {
    const fetchTemplates = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/labels/templates?entityType=${entityType}`);
        const data = await response.json();

        if (response.ok) {
          setTemplates(data.templates || []);
        }
      } catch {
        // Silent fail - label selection is optional
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplates();
  }, [entityType]);

  // For PRODUCT entities, also fetch associations
  useEffect(() => {
    if (entityType !== 'PRODUCT') return;

    const fetchAssociations = async () => {
      setIsLoadingAssociations(true);
      setAssociationError(null);
      try {
        const response = await fetch(`/api/products/${entityId}/labels`);
        const data = await response.json();

        if (response.ok) {
          setAssociations(data.labels || []);
        } else {
          setAssociationError(data.error || 'Failed to load associations');
        }
      } catch {
        setAssociationError('Failed to load label associations');
      } finally {
        setIsLoadingAssociations(false);
      }
    };

    fetchAssociations();
  }, [entityType, entityId]);

  // Auto-select first active version from filtered templates
  useEffect(() => {
    if (isLoading || (entityType === 'PRODUCT' && isLoadingAssociations)) return;

    const filteredTemplates = getFilteredTemplates();
    const activeVersion = filteredTemplates
      .flatMap(t => t.versions)
      .find(v => v.isActive);

    if (activeVersion && !selectedVersionId) {
      setSelectedVersionId(activeVersion.id);
    }
  }, [templates, associations, isLoading, isLoadingAssociations, entityType]);

  // Get templates eligible for association (have at least one active version)
  const eligibleTemplates = templates.filter(t => 
    t.versions.some(v => v.isActive)
  );

  // Get templates to show in dropdown (filtered by associations for PRODUCT, all for others)
  const getFilteredTemplates = useCallback((): LabelTemplate[] => {
    if (entityType !== 'PRODUCT' || associations.length === 0) {
      // No associations or not a product: show all templates
      return templates;
    }
    // Filter to only associated templates
    const associatedIds = new Set(associations.map(a => a.templateId));
    return templates.filter(t => associatedIds.has(t.id));
  }, [entityType, templates, associations]);

  const filteredTemplates = getFilteredTemplates();

  const allVersions = filteredTemplates.flatMap(t => 
    t.versions.map(v => ({
      ...v,
      templateName: t.name,
      templateId: t.id
    }))
  );

  const selectedLabel = allVersions.find(v => v.id === selectedVersionId);

  // Derive current carrier selections from associations
  const qrCarrierTemplateId = associations.find(a => a.isQrCarrier)?.templateId ?? 
    (associations.length > 0 ? associations[0].templateId : null);
  const barcodeCarrierTemplateId = associations.find(a => a.isBarcodeCarrier)?.templateId ?? 
    (associations.length > 0 ? associations[0].templateId : null);

  // Save associations with carrier selection
  const saveAssociations = async (
    newTemplateIds: string[],
    newQrCarrier?: string | null,
    newBarcodeCarrier?: string | null
  ) => {
    setIsSavingAssociations(true);
    setAssociationError(null);

    try {
      const response = await fetch(`/api/products/${entityId}/labels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          templateIds: newTemplateIds,
          qrCarrierTemplateId: newQrCarrier,
          barcodeCarrierTemplateId: newBarcodeCarrier
        })
      });

      const data = await response.json();

      if (response.ok) {
        setAssociations(data.labels || []);
        return true;
      } else {
        setAssociationError(data.error || 'Failed to update associations');
        return false;
      }
    } catch {
      setAssociationError('Failed to update label associations');
      return false;
    } finally {
      setIsSavingAssociations(false);
    }
  };

  // Handle association toggle
  const handleAssociationToggle = async (templateId: string, isChecked: boolean) => {
    if (entityType !== 'PRODUCT') return;

    const currentIds = associations.map(a => a.templateId);
    const newIds = isChecked
      ? [...currentIds, templateId]
      : currentIds.filter(id => id !== templateId);

    // Preserve carrier selections if the carrier is still in the list
    const newQrCarrier = newIds.includes(qrCarrierTemplateId ?? '') ? qrCarrierTemplateId : null;
    const newBarcodeCarrier = newIds.includes(barcodeCarrierTemplateId ?? '') ? barcodeCarrierTemplateId : null;

    const success = await saveAssociations(newIds, newQrCarrier, newBarcodeCarrier);
    
    if (success && !isChecked && selectedLabel?.templateId === templateId) {
      setSelectedVersionId('');
    }
  };

  // Handle carrier selection change
  const handleCarrierChange = async (type: 'qr' | 'barcode', templateId: string) => {
    if (entityType !== 'PRODUCT') return;

    const currentIds = associations.map(a => a.templateId);
    const newQrCarrier = type === 'qr' ? templateId : qrCarrierTemplateId;
    const newBarcodeCarrier = type === 'barcode' ? templateId : barcodeCarrierTemplateId;

    await saveAssociations(currentIds, newQrCarrier, newBarcodeCarrier);
  };

  const isTemplateAssociated = (templateId: string) => 
    associations.some(a => a.templateId === templateId);

  // Check if we should show carrier selectors (only when 2+ labels associated)
  const showCarrierSelectors = associations.length >= 2;
  
  // Edit mode toggle for PRODUCT entities
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Get associated templates for display mode
  const associatedTemplates = eligibleTemplates.filter(t => isTemplateAssociated(t.id));

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4">Label Settings</h2>
      
      <div className="space-y-4">
        {/* Association Management - only for PRODUCT entities */}
        {entityType === 'PRODUCT' && (
          <div className="border-b pb-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                {isEditMode ? 'Edit Label Associations' : 'Associated Labels'}
              </label>
              {eligibleTemplates.length > 0 && (
                <button
                  onClick={() => setIsEditMode(!isEditMode)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  {isEditMode ? 'Done' : 'Edit'}
                </button>
              )}
            </div>
            
            {isEditMode && (
              <p className="text-xs text-gray-500 mb-3">
                Select which label templates are available for this product.
              </p>
            )}
            
            {isLoadingAssociations ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : eligibleTemplates.length === 0 ? (
              <div className="text-sm text-gray-500">
                No label templates with active versions available.{' '}
                <a href="/ops/labels" className="text-blue-600 hover:underline">
                  Create one
                </a>
              </div>
            ) : isEditMode ? (
              /* EDIT MODE: Show all eligible templates with checkboxes */
              <div className="space-y-2">
                {/* Header row for carrier columns when multiple labels */}
                {showCarrierSelectors && (
                  <div className="flex items-center gap-3 px-2 py-1 text-xs text-gray-500 font-medium">
                    <div className="w-4" /> {/* Checkbox spacer */}
                    <div className="flex-1">Label</div>
                    <div className="w-12 text-center">QR</div>
                    <div className="w-16 text-center">Barcode</div>
                  </div>
                )}
                
                {eligibleTemplates.map(template => {
                  const isAssociated = isTemplateAssociated(template.id);
                  const activeVersionCount = template.versions.filter(v => v.isActive).length;
                  const isQrCarrier = template.id === qrCarrierTemplateId;
                  const isBarcodeCarrier = template.id === barcodeCarrierTemplateId;
                  
                  return (
                    <div
                      key={template.id}
                      className={`flex items-center gap-3 p-2 rounded border transition-colors ${
                        isAssociated 
                          ? 'bg-blue-50 border-blue-200' 
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      } ${isSavingAssociations ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      {/* Association checkbox */}
                      <input
                        type="checkbox"
                        checked={isAssociated}
                        onChange={(e) => handleAssociationToggle(template.id, e.target.checked)}
                        disabled={isSavingAssociations}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                      />
                      
                      {/* Label name */}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900">
                          {template.name}
                        </span>
                        <span className="ml-2 text-xs text-gray-500">
                          ({activeVersionCount} active version{activeVersionCount !== 1 ? 's' : ''})
                        </span>
                      </div>
                      
                      {/* Carrier selectors - only show when 2+ labels associated */}
                      {showCarrierSelectors && isAssociated && (
                        <>
                          {/* QR Carrier radio */}
                          <div className="w-12 flex justify-center">
                            <input
                              type="radio"
                              name="qrCarrier"
                              checked={isQrCarrier}
                              onChange={() => handleCarrierChange('qr', template.id)}
                              disabled={isSavingAssociations}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                              title="QR code carrier"
                            />
                          </div>
                          
                          {/* Barcode Carrier radio */}
                          <div className="w-16 flex justify-center">
                            <input
                              type="radio"
                              name="barcodeCarrier"
                              checked={isBarcodeCarrier}
                              onChange={() => handleCarrierChange('barcode', template.id)}
                              disabled={isSavingAssociations}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                              title="Barcode carrier"
                            />
                          </div>
                        </>
                      )}
                      
                      {/* Placeholder for alignment when not associated but showing carriers */}
                      {showCarrierSelectors && !isAssociated && (
                        <>
                          <div className="w-12" />
                          <div className="w-16" />
                        </>
                      )}
                    </div>
                  );
                })}
                
                {associations.length === 1 && (
                  <p className="mt-2 text-xs text-gray-500">
                    Single label — it will include both QR and barcode.
                  </p>
                )}
                
                {showCarrierSelectors && (
                  <p className="mt-2 text-xs text-gray-500">
                    Select which label carries the QR code and which carries the barcode.
                  </p>
                )}
              </div>
            ) : (
              /* DISPLAY MODE: Show only associated templates with print icons */
              <div className="space-y-2">
                {associatedTemplates.length === 0 ? (
                  <div className="text-sm text-gray-500">
                    No labels associated.{' '}
                    <button
                      onClick={() => setIsEditMode(true)}
                      className="text-blue-600 hover:underline"
                    >
                      Add labels
                    </button>
                  </div>
                ) : (
                  associatedTemplates.map(template => {
                    const activeVersion = template.versions.find(v => v.isActive);
                    const isQrCarrier = template.id === qrCarrierTemplateId;
                    const isBarcodeCarrier = template.id === barcodeCarrierTemplateId;
                    
                    return (
                      <div
                        key={template.id}
                        className="flex items-center gap-3 p-2 rounded border bg-white border-gray-200"
                      >
                        {/* Label name */}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-900">
                            {template.name}
                          </span>
                          {/* Show carrier badges when multiple labels */}
                          {showCarrierSelectors && (
                            <span className="ml-2">
                              {isQrCarrier && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 mr-1">
                                  QR
                                </span>
                              )}
                              {isBarcodeCarrier && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                  Barcode
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        
                        {/* Print button */}
                        {activeVersion && (
                          <PrintLabelButton
                            entityType={entityType}
                            entityId={entityId}
                            entityCode={entityCode}
                            selectedVersionId={activeVersion.id}
                            buttonText=""
                            iconOnly
                            autoPreview
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
            
            {associationError && (
              <p className="mt-2 text-xs text-red-600">{associationError}</p>
            )}
            
            {isSavingAssociations && (
              <p className="mt-2 text-xs text-gray-500">Saving...</p>
            )}
          </div>
        )}

        {/* For non-PRODUCT entities, show label selector and print button */}
        {entityType !== 'PRODUCT' && (
          <>
            <div>
              <label htmlFor="labelVersion" className="block text-sm font-medium text-gray-700 mb-1">
                Label Template
              </label>
              {isLoading ? (
                <div className="text-sm text-gray-500">Loading labels...</div>
              ) : allVersions.length === 0 ? (
                <div className="text-sm text-gray-500">
                  No label templates available.{' '}
                  <a href="/ops/labels" className="text-blue-600 hover:underline">
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

            <div className="pt-2">
              <PrintLabelButton
                entityType={entityType}
                entityId={entityId}
                entityCode={entityCode}
                selectedVersionId={selectedVersionId}
                autoPreview
                className={!selectedVersionId ? 'opacity-50 cursor-not-allowed' : ''}
              />
              {!selectedVersionId && (
                <p className="mt-1 text-xs text-gray-500">
                  Select a label template above to enable printing
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
