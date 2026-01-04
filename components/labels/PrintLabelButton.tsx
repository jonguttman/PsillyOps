'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  validateSheetConfig, 
  MAX_LABELS_PER_JOB,
  LETTER_WIDTH_IN,
  LETTER_HEIGHT_IN,
  MIN_MARGIN_IN,
  MAX_MARGIN_IN,
  MAX_LABEL_WIDTH_IN,
  MAX_LABEL_HEIGHT_IN,
} from '@/lib/utils/sheetValidation';

interface LabelVersion {
  id: string;
  version: string;
  isActive: boolean;
  notes: string | null;
  labelWidthIn?: number | null;
  labelHeightIn?: number | null;
}

interface LabelTemplate {
  id: string;
  name: string;
  entityType: string;
  versions: LabelVersion[];
}

interface ProductPrintSettings {
  labelPrintQuantity: number | null;
  labelWidthIn: number | null;
  labelHeightIn: number | null;
  sheetMarginTopBottomIn: number | null;
}

// Per-template print settings from ProductLabel association
interface TemplatePrintSettings {
  templateId: string;
  labelPrintQuantity: number | null;
  sheetMarginTopBottomIn: number | null;
  labelWidthIn: number | null;
  labelHeightIn: number | null;
}

interface PrintLabelButtonProps {
  entityType: 'PRODUCT' | 'BATCH' | 'INVENTORY';
  entityId: string;
  entityCode: string;
  buttonText?: string;
  className?: string;
  selectedVersionId?: string;
  iconOnly?: boolean;
  autoPreview?: boolean;
}

// Default print settings
const DEFAULT_MARGIN_TOP_BOTTOM = 0.5;
const DEFAULT_LABEL_WIDTH = 2;
const DEFAULT_LABEL_HEIGHT = 1;

export default function PrintLabelButton({
  entityType,
  entityId,
  entityCode,
  buttonText = 'Print Labels',
  className = '',
  selectedVersionId: externalVersionId,
  iconOnly = false,
  autoPreview = false
}: PrintLabelButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [internalVersionId, setInternalVersionId] = useState<string>('');
  const selectedVersionId = externalVersionId || internalVersionId;
  
  // Print settings (quantity + margin persisted per product+template; width/height from template version)
  const [quantity, setQuantity] = useState(1);
  const [labelWidthIn, setLabelWidthIn] = useState<number>(DEFAULT_LABEL_WIDTH);
  const [labelHeightIn, setLabelHeightIn] = useState<number>(DEFAULT_LABEL_HEIGHT);
  const [sheetMarginTopBottomIn, setSheetMarginTopBottomIn] = useState<number>(DEFAULT_MARGIN_TOP_BOTTOM);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  // Per-template settings cache (for PRODUCT entities with associations)
  const [templateSettings, setTemplateSettings] = useState<TemplatePrintSettings[]>([]);
  // Fallback product-level settings (for back-compat)
  const [productFallbackSettings, setProductFallbackSettings] = useState<ProductPrintSettings | null>(null);
  
  const [sheetSvgs, setSheetSvgs] = useState<string[]>([]);
  const [sheetMeta, setSheetMeta] = useState<{
    perSheet: number;
    columns: number;
    rows: number;
    rotationUsed: boolean;
    totalSheets: number;
  } | null>(null);
  const [printJobId, setPrintJobId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [paperUsedOnReprint, setPaperUsedOnReprint] = useState(false);
  const [isMarkingPaper, setIsMarkingPaper] = useState(false);
  const printContainerRef = useRef<HTMLDivElement>(null);
  
  // Barcode guardrails
  const [labelHasBarcode, setLabelHasBarcode] = useState(false);
  const [productBarcodeValue, setProductBarcodeValue] = useState<string | null>(null);
  const [barcodeCheckLoading, setBarcodeCheckLoading] = useState(false);

  // === VALIDATION ===
  const validation = useMemo(() => {
    return validateSheetConfig({
      labelWidthIn,
      labelHeightIn,
      marginTopBottomIn: sheetMarginTopBottomIn,
      quantity,
    });
  }, [labelWidthIn, labelHeightIn, sheetMarginTopBottomIn, quantity]);

  const hasValidationErrors = !validation.valid;
  const isBarcodeBlocked = labelHasBarcode && !productBarcodeValue;
  const isBlocked = hasValidationErrors || isBarcodeBlocked;

  const getPreviewSvg = (sheetSvg: string) => {
    return sheetSvg.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
      const hasPreserve = /\bpreserveAspectRatio=/.test(attrs);
      const styleMatch = attrs.match(/\bstyle="([^"]*)"/i);
      if (styleMatch) {
        const mergedStyle = `${styleMatch[1].replace(/;?\s*$/, ';')}width:100%;height:auto;`;
        let nextAttrs = attrs.replace(/\bstyle="[^"]*"/i, `style="${mergedStyle}"`);
        if (!hasPreserve) nextAttrs += ' preserveAspectRatio="xMidYMid meet"';
        return `<svg${nextAttrs}>`;
      }
      return `<svg${attrs} style="width:100%;height:auto;"${hasPreserve ? '' : ' preserveAspectRatio="xMidYMid meet"'}>`;
    });
  };

  // Derive templateId from selectedVersionId
  const selectedTemplateId = useMemo(() => {
    if (!selectedVersionId || templates.length === 0) return null;
    for (const t of templates) {
      if (t.versions.some(v => v.id === selectedVersionId)) {
        return t.id;
      }
    }
    return null;
  }, [selectedVersionId, templates]);

  // Save print settings per template (quantity, margin, width, height)
  const savePrintSettings = useCallback(async () => {
    if (entityType !== 'PRODUCT' || !selectedTemplateId) return;
    
    setIsSavingSettings(true);
    try {
      // Save per-template settings via PATCH /api/products/:id/labels
      await fetch(`/api/products/${entityId}/labels`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          labelPrintQuantity: validation.clampedQuantity,
          sheetMarginTopBottomIn,
          labelWidthIn,
          labelHeightIn,
        })
      });
      
      // Update local cache
      setTemplateSettings(prev => {
        const existing = prev.find(s => s.templateId === selectedTemplateId);
        if (existing) {
          return prev.map(s => s.templateId === selectedTemplateId 
            ? { ...s, labelPrintQuantity: validation.clampedQuantity, sheetMarginTopBottomIn, labelWidthIn, labelHeightIn }
            : s
          );
        }
        return [...prev, { templateId: selectedTemplateId, labelPrintQuantity: validation.clampedQuantity, sheetMarginTopBottomIn, labelWidthIn, labelHeightIn }];
      });
    } catch (err) {
      console.error('Failed to save print settings:', err);
    } finally {
      setIsSavingSettings(false);
    }
  }, [entityType, entityId, selectedTemplateId, validation.clampedQuantity, sheetMarginTopBottomIn, labelWidthIn, labelHeightIn]);

  // Load saved print settings: per-template from associations, with fallback to product-level
  const loadPrintSettings = useCallback(async () => {
    if (entityType !== 'PRODUCT') {
      setSettingsLoaded(true);
      return;
    }
    
    try {
      // Fetch per-template settings from associations
      const labelsRes = await fetch(`/api/products/${entityId}/labels`);
      if (labelsRes.ok) {
        const labelsData = await labelsRes.json();
        const associations = labelsData.labels || [];
        const perTemplateSettings: TemplatePrintSettings[] = associations.map((a: {
          templateId: string;
          labelPrintQuantity: number | null;
          sheetMarginTopBottomIn: number | null;
          labelWidthIn: number | null;
          labelHeightIn: number | null;
        }) => ({
          templateId: a.templateId,
          labelPrintQuantity: a.labelPrintQuantity,
          sheetMarginTopBottomIn: a.sheetMarginTopBottomIn,
          labelWidthIn: a.labelWidthIn,
          labelHeightIn: a.labelHeightIn
        }));
        setTemplateSettings(perTemplateSettings);
      }
      
      // Also fetch product-level settings as fallback (for back-compat)
      const productRes = await fetch(`/api/products/${entityId}`);
      if (productRes.ok) {
        const product = await productRes.json();
        setProductFallbackSettings({
          labelPrintQuantity: product.labelPrintQuantity,
          labelWidthIn: product.labelWidthIn,
          labelHeightIn: product.labelHeightIn,
          sheetMarginTopBottomIn: product.sheetMarginTopBottomIn,
        });
      }
    } catch (err) {
      console.error('Failed to load print settings:', err);
    } finally {
      setSettingsLoaded(true);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      loadPrintSettings();
      checkBarcodeRequirements();
    }
  }, [isOpen, loadPrintSettings]);
  
  useEffect(() => {
    if (selectedVersionId) {
      checkBarcodeRequirements();
    }
  }, [selectedVersionId]);
  
  // Auto-preview: trigger render when modal opens and settings are loaded
  const [hasAutoRendered, setHasAutoRendered] = useState(false);
  useEffect(() => {
    if (autoPreview && isOpen && settingsLoaded && selectedVersionId && !hasAutoRendered && !isRendering && !sheetSvgs.length) {
      setHasAutoRendered(true);
      handleRender();
    }
  }, [autoPreview, isOpen, settingsLoaded, selectedVersionId, hasAutoRendered, isRendering, sheetSvgs.length]);
  
  // Reset auto-render flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      setHasAutoRendered(false);
    }
  }, [isOpen]);
  
  // Apply per-template settings when template changes (for PRODUCT entities)
  useEffect(() => {
    if (entityType !== 'PRODUCT' || !selectedTemplateId || !settingsLoaded) return;
    
    // Find per-template settings
    const perTemplate = templateSettings.find(s => s.templateId === selectedTemplateId);
    
    // Apply quantity: per-template > product fallback > default
    if (perTemplate?.labelPrintQuantity !== null && perTemplate?.labelPrintQuantity !== undefined) {
      setQuantity(perTemplate.labelPrintQuantity);
    } else if (productFallbackSettings?.labelPrintQuantity !== null && productFallbackSettings?.labelPrintQuantity !== undefined) {
      setQuantity(productFallbackSettings.labelPrintQuantity);
    } else {
      setQuantity(1);
    }
    
    // Apply margin: per-template > product fallback > default
    if (perTemplate?.sheetMarginTopBottomIn !== null && perTemplate?.sheetMarginTopBottomIn !== undefined) {
      setSheetMarginTopBottomIn(perTemplate.sheetMarginTopBottomIn);
    } else if (productFallbackSettings?.sheetMarginTopBottomIn !== null && productFallbackSettings?.sheetMarginTopBottomIn !== undefined) {
      setSheetMarginTopBottomIn(productFallbackSettings.sheetMarginTopBottomIn);
    } else {
      setSheetMarginTopBottomIn(DEFAULT_MARGIN_TOP_BOTTOM);
    }
    
    // Apply width: per-template > product fallback > template version > default
    // NOTE: If perTemplate has default values (2x1), treat as "not set" and use fallback
    // This handles the case where perTemplate was saved with defaults before user set custom size
    const perTemplateHasCustomWidth = perTemplate?.labelWidthIn !== null && 
                                       perTemplate?.labelWidthIn !== undefined &&
                                       !(perTemplate.labelWidthIn === DEFAULT_LABEL_WIDTH && perTemplate.labelHeightIn === DEFAULT_LABEL_HEIGHT);
    const perTemplateHasCustomHeight = perTemplate?.labelHeightIn !== null && 
                                        perTemplate?.labelHeightIn !== undefined &&
                                        !(perTemplate.labelWidthIn === DEFAULT_LABEL_WIDTH && perTemplate.labelHeightIn === DEFAULT_LABEL_HEIGHT);
    
    if (perTemplateHasCustomWidth) {
      setLabelWidthIn(perTemplate!.labelWidthIn!);
    } else if (productFallbackSettings?.labelWidthIn !== null && productFallbackSettings?.labelWidthIn !== undefined) {
      setLabelWidthIn(productFallbackSettings.labelWidthIn);
    }
    // Note: if neither per-template nor fallback, the version effect below will handle it
    
    // Apply height: per-template > product fallback > template version > default
    if (perTemplateHasCustomHeight) {
      setLabelHeightIn(perTemplate!.labelHeightIn!);
    } else if (productFallbackSettings?.labelHeightIn !== null && productFallbackSettings?.labelHeightIn !== undefined) {
      setLabelHeightIn(productFallbackSettings.labelHeightIn);
    }
    // Note: if neither per-template nor fallback, the version effect below will handle it
  }, [entityType, selectedTemplateId, templateSettings, productFallbackSettings, settingsLoaded]);

  // Apply label dimensions from template version as final fallback (if no saved settings)
  useEffect(() => {
    if (selectedVersionId && templates.length > 0 && settingsLoaded && entityType === 'PRODUCT' && selectedTemplateId) {
      const perTemplate = templateSettings.find(s => s.templateId === selectedTemplateId);
      // Only apply version dimensions if no per-template or fallback settings exist
      // NOTE: If perTemplate has default values (2x1), treat as "not set"
      const perTemplateIsDefault = perTemplate?.labelWidthIn === DEFAULT_LABEL_WIDTH && perTemplate?.labelHeightIn === DEFAULT_LABEL_HEIGHT;
      const hasWidthSetting = ((perTemplate?.labelWidthIn !== null && perTemplate?.labelWidthIn !== undefined && !perTemplateIsDefault) ||
                              (productFallbackSettings?.labelWidthIn !== null && productFallbackSettings?.labelWidthIn !== undefined));
      const hasHeightSetting = ((perTemplate?.labelHeightIn !== null && perTemplate?.labelHeightIn !== undefined && !perTemplateIsDefault) ||
                               (productFallbackSettings?.labelHeightIn !== null && productFallbackSettings?.labelHeightIn !== undefined));
      
      if (!hasWidthSetting || !hasHeightSetting) {
        const allVersions = templates.flatMap(t => t.versions);
        const version = allVersions.find(v => v.id === selectedVersionId);
        if (version) {
          if (!hasWidthSetting) {
            setLabelWidthIn(version.labelWidthIn || DEFAULT_LABEL_WIDTH);
          }
          if (!hasHeightSetting) {
            setLabelHeightIn(version.labelHeightIn || DEFAULT_LABEL_HEIGHT);
          }
        }
      }
    } else if (selectedVersionId && templates.length > 0 && settingsLoaded && entityType !== 'PRODUCT') {
      // Non-PRODUCT entities: always use version dimensions
      const allVersions = templates.flatMap(t => t.versions);
      const version = allVersions.find(v => v.id === selectedVersionId);
      if (version) {
        setLabelWidthIn(version.labelWidthIn || DEFAULT_LABEL_WIDTH);
        setLabelHeightIn(version.labelHeightIn || DEFAULT_LABEL_HEIGHT);
      }
    }
  }, [selectedVersionId, templates, settingsLoaded, entityType, selectedTemplateId, templateSettings, productFallbackSettings]);
  
  const checkBarcodeRequirements = async () => {
    if (!selectedVersionId) {
      setLabelHasBarcode(false);
      return;
    }
    
    setBarcodeCheckLoading(true);
    try {
      // Get the version data to check for BARCODE elements and get templateId
      const versionRes = await fetch(`/api/labels/versions/${selectedVersionId}`);
      if (versionRes.ok) {
        const versionData = await versionRes.json();
        const elements = versionData.elements || [];
        const rawHasBarcode = elements.some((el: { type: string }) => el.type === 'BARCODE');
        
        // For PRODUCT entities, check if this label is the barcode carrier
        // If not the carrier, the barcode won't actually render (carrier filtering)
        if (entityType === 'PRODUCT' && rawHasBarcode) {
          // Fetch product label associations to check carrier status
          const labelsRes = await fetch(`/api/products/${entityId}/labels`);
          if (labelsRes.ok) {
            const labelsData = await labelsRes.json();
            const associations = labelsData.labels || [];
            
            if (associations.length === 0) {
              // No associations = legacy behavior, all labels are carriers
              setLabelHasBarcode(true);
            } else {
              // Find which template is the barcode carrier
              const barcodeCarrier = associations.find((a: { isBarcodeCarrier: boolean }) => a.isBarcodeCarrier);
              const carrierTemplateId = barcodeCarrier?.templateId ?? associations[0]?.templateId;
              
              // Check if this version's template is the barcode carrier
              const isBarcodeCarrier = versionData.templateId === carrierTemplateId;
              setLabelHasBarcode(isBarcodeCarrier);
            }
          } else {
            // Fallback: assume it has barcode if elements say so
            setLabelHasBarcode(rawHasBarcode);
          }
        } else {
          setLabelHasBarcode(rawHasBarcode);
        }
      }
      
      if (entityType === 'PRODUCT') {
        const productRes = await fetch(`/api/products/${entityId}`);
        if (productRes.ok) {
          const productData = await productRes.json();
          const resolvedBarcode = productData.barcodeValue ?? productData.sku ?? null;
          setProductBarcodeValue(resolvedBarcode);
        }
      } else {
        setProductBarcodeValue(entityCode);
      }
    } catch (err) {
      console.error('Failed to check barcode requirements:', err);
    } finally {
      setBarcodeCheckLoading(false);
    }
  };

  const fetchTemplates = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/labels/templates?entityType=${entityType}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch templates');
      }

      setTemplates(data.templates || []);

      if (!externalVersionId) {
        const activeVersion = data.templates
          ?.flatMap((t: LabelTemplate) => t.versions)
          ?.find((v: LabelVersion) => v.isActive);
        
        if (activeVersion) {
          setInternalVersionId(activeVersion.id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRender = async () => {
    if (!selectedVersionId) {
      setError('Please select a label version');
      return;
    }
    
    if (hasValidationErrors) {
      setError(validation.errors.map(e => e.message).join('; '));
      return;
    }

    setIsRendering(true);
    setError(null);
    setSheetSvgs([]);
    setSheetMeta(null);

    // Save print settings when user previews
    await savePrintSettings();

    try {
      const response = await fetch('/api/labels/render-letter-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId: selectedVersionId,
          entityType,
          entityId,
          quantity: validation.clampedQuantity,
          labelWidthIn,
          labelHeightIn,
          marginIn: sheetMarginTopBottomIn,
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to render label');
      }

      setSheetSvgs(Array.isArray(data.sheets) ? data.sheets : []);
      setSheetMeta({
        perSheet: data.perSheet ?? 0,
        columns: data.columns ?? 0,
        rows: data.rows ?? 0,
        rotationUsed: !!data.rotationUsed,
        totalSheets: data.totalSheets ?? 0
      });
      setPrintJobId(data.printJobId || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to render label');
    } finally {
      setIsRendering(false);
    }
  };

  const handlePrint = async (isReprint = false) => {
    if (!sheetSvgs.length || !printContainerRef.current) return;

    // Save print settings when user prints
    await savePrintSettings();

    if (isReprint && printJobId) {
      setShowReprintModal(true);
      return;
    }

    executePrint();
  };

  const executePrint = () => {
    if (!sheetSvgs.length) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('Unable to open print window. Please allow popups.');
      return;
    }

    const sheetsHtml = sheetSvgs
      .map(
        (svg, i) =>
          `<div class="sheet" style="page-break-after: ${i < sheetSvgs.length - 1 ? 'always' : 'avoid'};">${svg}</div>`
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Label - ${entityCode}</title>
          <style>
            @page { size: letter; margin: 0; }
            @media print {
              body { margin: 0; padding: 0; }
              .sheet { page-break-inside: avoid; }
              svg { width: 8.5in; height: 11in; }
            }
            @media screen {
              body { font-family: sans-serif; padding: 20px; }
              .sheet { border: 1px solid #ccc; padding: 10px; margin-bottom: 20px; background: #fff; }
              svg { width: 8.5in; height: 11in; }
            }
          </style>
        </head>
        <body>
          ${sheetsHtml}
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() {
                window.close();
              };
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleReprintConfirm = async () => {
    setIsMarkingPaper(true);
    setError(null);

    try {
      if (paperUsedOnReprint && printJobId && sheetMeta) {
        await fetch(`/api/print-jobs/${printJobId}/mark-paper-used`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sheetsUsed: sheetMeta.totalSheets })
        });
      }

      setShowReprintModal(false);
      setPaperUsedOnReprint(false);
      executePrint();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark paper usage');
    } finally {
      setIsMarkingPaper(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedVersionId) {
      setError('Please select a label version');
      return;
    }
    
    if (hasValidationErrors) {
      setError(validation.errors.map(e => e.message).join('; '));
      return;
    }

    setIsDownloadingPdf(true);
    setError(null);

    // Save print settings when user downloads PDF
    await savePrintSettings();

    try {
      // Production print - always use 'token' mode for unique QR codes
      const response = await fetch(`/api/labels/versions/${selectedVersionId}/sheet-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          quantity: validation.clampedQuantity,
          labelWidthIn,
          labelHeightIn,
          mode: 'token', // Production print ALWAYS uses token mode
          entityType,
          entityId,
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate PDF');
      }

      const blob = await response.blob();
      const safe = entityCode.replace(/[^a-z0-9]/gi, '_');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `label-sheet-${safe}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download PDF');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const allVersions = templates.flatMap(t => 
    t.versions.map(v => ({
      ...v,
      templateName: t.name
    }))
  );

  const hasActiveTemplate = allVersions.some(v => v.isActive);

  return (
    <>
      {iconOnly ? (
        <button
          onClick={() => setIsOpen(true)}
          className={`inline-flex items-center justify-center p-1.5 rounded text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition-colors ${className}`}
          title="Print this label"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className={`inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 ${className}`}
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          {buttonText}
        </button>
      )}

      {/* Print Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => setIsOpen(false)}
            />

            <div className="relative inline-block bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:w-full sm:max-w-3xl">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Print Labels</h3>
                    <p className="text-sm text-gray-500">{entityType}: {entityCode}</p>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {error && (
                  <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                    {error}
                  </div>
                )}
                
                {/* Barcode guardrail warning */}
                {labelHasBarcode && !productBarcodeValue && !barcodeCheckLoading && (
                  <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 rounded text-sm">
                    <div className="flex items-start">
                      <svg className="h-5 w-5 text-yellow-400 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="font-medium">This label requires a barcode.</p>
                        <p className="text-xs mt-1">Set one in Product Settings before printing.</p>
                      </div>
                    </div>
                  </div>
                )}

                {isLoading ? (
                  <div className="py-12 text-center">
                    <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-500">Loading templates...</p>
                  </div>
                ) : templates.length === 0 ? (
                  <div className="py-12 text-center text-gray-500">
                    <svg className="h-12 w-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="font-medium">No label templates found</p>
                    <p className="text-sm mt-1">Create a {entityType} label template in the Labels page first.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    {/* Controls */}
                    <div className="space-y-4">
                      {/* Label selection */}
                      {!externalVersionId && (
                        <div>
                          <label htmlFor="version" className="block text-sm font-medium text-gray-700">
                            Label Version
                          </label>
                          <select
                            id="version"
                            value={selectedVersionId}
                            onChange={(e) => {
                              setInternalVersionId(e.target.value);
                              setSheetSvgs([]);
                              setSheetMeta(null);
                            }}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          >
                            <option value="">Select a version...</option>
                            {allVersions.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.templateName} v{v.version} {v.isActive ? '(Active)' : ''}
                              </option>
                            ))}
                          </select>
                          {!hasActiveTemplate && (
                            <p className="mt-1 text-xs text-yellow-600">
                              No active version. Activate a version in the Labels page for default selection.
                            </p>
                          )}
                        </div>
                      )}

                      {externalVersionId && (
                        <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded p-3">
                          <span className="font-medium">Label:</span>{' '}
                          {allVersions.find(v => v.id === externalVersionId)?.templateName || 'Selected'} v
                          {allVersions.find(v => v.id === externalVersionId)?.version || '?'}
                          <p className="text-xs text-gray-500 mt-1">
                            Change label in Product Settings
                          </p>
                        </div>
                      )}

                      {/* Print Settings Section */}
                      <div className="border-t pt-4 mt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">
                          Print settings
                          {entityType === 'PRODUCT' && (
                            <span className="font-normal text-gray-500 ml-1">(saved per label)</span>
                          )}
                        </h4>
                      </div>

                      {/* Label Size */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="labelWidth" className="block text-sm font-medium text-gray-700">
                            Label Width (in)
                          </label>
                          <input
                            type="number"
                            id="labelWidth"
                            min="0.1"
                            max={MAX_LABEL_WIDTH_IN}
                            step="0.125"
                            value={labelWidthIn}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || DEFAULT_LABEL_WIDTH;
                              setLabelWidthIn(val);
                              setSheetSvgs([]);
                              setSheetMeta(null);
                            }}
                            className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                              validation.errors.some(e => e.field === 'labelWidthIn')
                                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                            }`}
                          />
                        </div>
                        <div>
                          <label htmlFor="labelHeight" className="block text-sm font-medium text-gray-700">
                            Label Height (in)
                          </label>
                          <input
                            type="number"
                            id="labelHeight"
                            min="0.1"
                            max={MAX_LABEL_HEIGHT_IN}
                            step="0.125"
                            value={labelHeightIn}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || DEFAULT_LABEL_HEIGHT;
                              setLabelHeightIn(val);
                              setSheetSvgs([]);
                              setSheetMeta(null);
                            }}
                            className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                              validation.errors.some(e => e.field === 'labelHeightIn')
                                ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Top/Bottom Margin */}
                      <div>
                        <label htmlFor="marginTopBottom" className="block text-sm font-medium text-gray-700">
                          Top/Bottom Margin (in)
                        </label>
                        <input
                          type="number"
                          id="marginTopBottom"
                          min={MIN_MARGIN_IN}
                          max={MAX_MARGIN_IN}
                          step="0.125"
                          value={sheetMarginTopBottomIn}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || DEFAULT_MARGIN_TOP_BOTTOM;
                            setSheetMarginTopBottomIn(val);
                            setSheetSvgs([]);
                            setSheetMeta(null);
                          }}
                          className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                            validation.errors.some(e => e.field === 'marginTopBottomIn')
                              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                          }`}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Left/right margins are maximized automatically
                        </p>
                      </div>

                      {/* Quantity */}
                      <div>
                        <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
                          Quantity
                        </label>
                        <input
                          type="number"
                          id="quantity"
                          min="1"
                          max={MAX_LABELS_PER_JOB}
                          value={quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            setQuantity(val);
                            setSheetSvgs([]);
                            setSheetMeta(null);
                          }}
                          className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm ${
                            validation.errors.some(e => e.field === 'quantity')
                              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                          }`}
                        />
                        {quantity > MAX_LABELS_PER_JOB && (
                          <p className="mt-1 text-xs text-yellow-600">
                            Maximum of {MAX_LABELS_PER_JOB} labels per print job
                          </p>
                        )}
                      </div>

                      {/* Sheet Summary (read-only) */}
                      <div className="bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-600">
                        <div className="font-medium text-gray-700 mb-2">Sheet Summary</div>
                        <div className="space-y-1">
                          <div>Paper: Letter ({LETTER_WIDTH_IN} × {LETTER_HEIGHT_IN} in)</div>
                          <div>Label: {labelWidthIn} × {labelHeightIn} in</div>
                          <div>Margins: {sheetMarginTopBottomIn} in (top/bottom)</div>
                          {validation.layout && validation.layout.perSheet > 0 ? (
                            <>
                              <div>Layout: {validation.layout.columns} × {validation.layout.rows} grid{validation.layout.rotationUsed ? ' (rotated)' : ''}</div>
                              <div className="font-medium text-gray-700 pt-1 border-t border-gray-200 mt-2">
                                {validation.layout.perSheet} labels/sheet · {validation.sheetsRequired} sheet{validation.sheetsRequired !== 1 ? 's' : ''} needed
                              </div>
                            </>
                          ) : (
                            <div className="text-red-600 font-medium">
                              Label too large for sheet
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Validation Errors */}
                      {validation.errors.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700">
                          <div className="font-medium mb-1">Cannot print:</div>
                          <ul className="list-disc list-inside space-y-0.5">
                            {validation.errors.map((err, i) => (
                              <li key={i}>{err.message}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Validation Warnings */}
                      {validation.warnings.length > 0 && validation.valid && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-yellow-700">
                          <div className="font-medium mb-1">Warnings:</div>
                          <ul className="list-disc list-inside space-y-0.5">
                            {validation.warnings.map((warn, i) => (
                              <li key={i}>{warn.message}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Save Settings Button - for PRODUCT entities */}
                      {entityType === 'PRODUCT' && selectedTemplateId && (
                        <button
                          onClick={savePrintSettings}
                          disabled={isSavingSettings}
                          className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSavingSettings ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Saving...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                              </svg>
                              Save Settings
                            </>
                          )}
                        </button>
                      )}

                      <button
                        onClick={handleRender}
                        disabled={!selectedVersionId || isRendering || isBlocked}
                        className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isBlocked ? (hasValidationErrors ? 'Fix validation errors first' : 'Set barcode in Product Settings first') : undefined}
                      >
                        {isRendering ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Rendering...
                          </>
                        ) : (
                          'Preview Label'
                        )}
                      </button>

                      {sheetMeta && (
                        <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded p-3">
                          <div>Rendered: {sheetMeta.columns}×{sheetMeta.rows} ({sheetMeta.perSheet}/sheet)</div>
                          <div>Rotation: {sheetMeta.rotationUsed ? '90°' : 'none'}</div>
                          <div>Sheets: {sheetSvgs.length}</div>
                          {isSavingSettings && (
                            <div className="text-blue-600 mt-1">Saving settings...</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Preview */}
                    <div className="border rounded-lg p-4 bg-gray-50 min-h-64 flex items-center justify-center" ref={printContainerRef}>
                      {sheetSvgs.length ? (
                        <div 
                          className="w-full"
                          dangerouslySetInnerHTML={{ __html: getPreviewSvg(sheetSvgs[0]) }}
                        />
                      ) : (
                        <div className="text-center text-gray-400">
                          <svg className="h-12 w-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-sm">Select a version and click Preview</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                {sheetSvgs.length > 0 && (
                  <>
                    <button
                      onClick={() => handlePrint(!!printJobId)}
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                    >
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      {printJobId ? 'Re-Print' : 'Print'} ({validation.clampedQuantity})
                    </button>
                    <button
                      onClick={handleDownloadPdf}
                      disabled={isDownloadingPdf || isBlocked}
                      className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                      title={isBlocked ? (hasValidationErrors ? 'Fix validation errors first' : 'Set barcode in Product Settings first') : undefined}
                    >
                      {isDownloadingPdf ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-700" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Generating...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download PDF
                        </>
                      )}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reprint Confirmation Modal */}
      {showReprintModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => !isMarkingPaper && setShowReprintModal(false)}
            />

            <div className="relative inline-block bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:w-full sm:max-w-lg">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                    <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      Did this reprint consume paper?
                    </h3>
                    <div className="mt-4">
                      <p className="text-sm text-gray-500 mb-3">
                        Select whether physical sheets were used for this reprint.
                      </p>

                      <div className="space-y-2">
                        <label className="flex items-center p-3 border rounded-md cursor-pointer hover:bg-gray-50">
                          <input
                            type="radio"
                            name="paperUsage"
                            checked={!paperUsedOnReprint}
                            onChange={() => setPaperUsedOnReprint(false)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="ml-3 text-sm font-medium text-gray-700">
                            No — test / preview only
                          </span>
                        </label>

                        <label className="flex items-center p-3 border rounded-md cursor-pointer hover:bg-gray-50">
                          <input
                            type="radio"
                            name="paperUsage"
                            checked={paperUsedOnReprint}
                            onChange={() => setPaperUsedOnReprint(true)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="ml-3 text-sm font-medium text-gray-700">
                            Yes — use {sheetMeta?.totalSheets} sheet{sheetMeta && sheetMeta.totalSheets > 1 ? 's' : ''}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  disabled={isMarkingPaper}
                  onClick={handleReprintConfirm}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                >
                  {isMarkingPaper ? 'Processing...' : 'Continue to Print'}
                </button>
                <button
                  type="button"
                  disabled={isMarkingPaper}
                  onClick={() => {
                    setShowReprintModal(false);
                    setPaperUsedOnReprint(false);
                  }}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
