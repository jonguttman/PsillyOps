'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import SvgInteractionLayer from './SvgInteractionLayer';
import type { PlaceableElement, Rotation, Placement } from '@/lib/types/placement';

/**
 * LABEL PREVIEW BUTTON
 * 
 * Phase 2: SVG-native interaction with proper zoom handling.
 * 
 * KEY FIX: Stage wrapper with rootContainer for Moveable alignment.
 * - Single stage div wraps SVG preview and interaction layer
 * - Zoom is applied via CSS transform on the stage
 * - Moveable receives zoom prop and rootContainer ref
 */

interface LabelPreviewButtonProps {
  versionId: string;
  entityType: string;
  initialElements?: PlaceableElement[];
}

type PreviewMode = 'single' | 'sheet';

interface LabelMetadata {
  widthIn: number;
  heightIn: number;
  elements: PlaceableElement[];
  pxPerInchX: number;
  pxPerInchY: number;
}

/**
 * Extract viewBox dimensions from SVG string
 */
function extractViewBox(svg: string): { width: number; height: number } | null {
  const match = svg.match(/viewBox=["']([^"']+)["']/i);
  if (!match) return null;
  
  const parts = match[1].split(/\s+/).map(parseFloat);
  if (parts.length >= 4) {
    return { width: parts[2], height: parts[3] };
  }
  return null;
}

export default function LabelPreviewButton({ 
  versionId, 
  entityType,
  initialElements = []
}: LabelPreviewButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Preview mode state
  const [previewMode, setPreviewMode] = useState<PreviewMode>('single');
  const [quantity, setQuantity] = useState(12);
  const [sheetMeta, setSheetMeta] = useState<{
    columns: number;
    rows: number;
    perSheet: number;
    rotationUsed: boolean;
    totalSheets: number;
  } | null>(null);
  
  // Label metadata from preview API
  const [labelMeta, setLabelMeta] = useState<LabelMetadata | null>(null);
  
  // ViewBox dimensions (extracted from SVG)
  const [viewBox, setViewBox] = useState<{ width: number; height: number } | null>(null);
  
  // Elements state (unified placement model)
  const [elements, setElements] = useState<PlaceableElement[]>(initialElements);
  const [savedElements, setSavedElements] = useState<PlaceableElement[]>(initialElements);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Stage ref for Moveable rootContainer
  const stageRef = useRef<HTMLDivElement>(null);

  // Track if values have changed from saved values
  useEffect(() => {
    const elementsChanged = JSON.stringify(elements) !== JSON.stringify(savedElements);
    setHasUnsavedChanges(elementsChanged);
  }, [elements, savedElements]);

  // Extract viewBox when SVG content changes
  useEffect(() => {
    if (svgContent) {
      const vb = extractViewBox(svgContent);
      setViewBox(vb);
    }
  }, [svgContent]);

  // Select first element when elements change
  useEffect(() => {
    if (elements.length > 0 && !selectedElementId) {
      setSelectedElementId(elements[0].id);
    }
  }, [elements, selectedElementId]);

  const handlePreview = async () => {
    setIsOpen(true);
    await fetchVersionData();
    await loadPreview();
  };

  const fetchVersionData = async () => {
    try {
      const response = await fetch(`/api/labels/versions/${versionId}`);
      if (response.ok) {
        const version = await response.json();
        
        // Load elements from version
        const loadedElements = version.elements || [];
        setElements(loadedElements);
        setSavedElements(loadedElements);
        
        // Select first element if available
        if (loadedElements.length > 0) {
          setSelectedElementId(loadedElements[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch version data:', err);
    }
  };

  const loadPreview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSvgContent(null);
    setSheetMeta(null);

    try {
      const endpoint = previewMode === 'single' 
        ? '/api/labels/preview'
        : '/api/labels/preview-sheet';

      const body = previewMode === 'single'
        ? { 
            versionId, 
            elements,
            format: 'json'
          }
        : { 
            versionId, 
            quantity,
            elements,
            format: 'json'
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to load preview');
      }

      const data = await response.json();
      setSvgContent(data.svg);
      
      // Set label metadata
      const meta: LabelMetadata = previewMode === 'single' ? data.meta : data.labelMeta;
      setLabelMeta(meta);
      
      // If no elements loaded yet, use the ones from metadata
      if (elements.length === 0 && meta.elements.length > 0) {
        setElements(meta.elements);
        setSavedElements(meta.elements);
        setSelectedElementId(meta.elements[0].id);
      }

      if (previewMode === 'sheet' && data.sheetMeta) {
        setSheetMeta(data.sheetMeta);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load preview');
    } finally {
      setIsLoading(false);
    }
  }, [previewMode, versionId, quantity, elements]);

  // Debounced preview update when elements change
  useEffect(() => {
    if (!isOpen) return;
    
    const timer = setTimeout(() => {
      loadPreview();
    }, 300);

    return () => clearTimeout(timer);
  }, [elements, isOpen, loadPreview]);

  const handleModeChange = (mode: PreviewMode) => {
    setPreviewMode(mode);
  };

  const handleRefresh = () => {
    loadPreview();
  };

  // Handle element changes from SvgInteractionLayer
  // Values come in as INCHES (converted by the layer)
  const handleElementChange = useCallback((id: string, updates: Partial<Placement>) => {
    setElements(prev => prev.map(el => {
      if (el.id !== id) return el;
      const isQr = el.type === 'QR';
      const newPlacement = { ...el.placement, ...updates };
      // Enforce QR square constraint
      if (isQr && updates.widthIn !== undefined) {
        newPlacement.heightIn = updates.widthIn;
      }
      return { ...el, placement: newPlacement };
    }));
  }, []);

  // Handle rotation change from sidebar buttons
  const handleRotate = useCallback((rotation: Rotation) => {
    if (!selectedElementId) return;
    setElements(prev => prev.map(el => {
      if (el.id !== selectedElementId) return el;
      return { ...el, placement: { ...el.placement, rotation } };
    }));
  }, [selectedElementId]);

  const handleSavePosition = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/labels/versions/${versionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elements })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to save position');
      }

      setSavedElements(elements);
      setHasUnsavedChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPosition = () => {
    setElements(savedElements);
  };

  // Get selected element
  const selectedElement = elements.find(el => el.id === selectedElementId) || null;

  // State for sidebar collapse
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Zoom state for preview display
  const [zoom, setZoom] = useState(100);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  
  // Fit to window calculation
  const handleFitToWindow = useCallback(() => {
    if (!previewAreaRef.current || !labelMeta) return;
    
    const container = previewAreaRef.current;
    const availableWidth = container.clientWidth - 80;
    const availableHeight = container.clientHeight - 80;
    
    const labelWidthPx = labelMeta.widthIn * 96;
    const labelHeightPx = labelMeta.heightIn * 96;
    
    const zoomToFitWidth = (availableWidth / labelWidthPx) * 100;
    const zoomToFitHeight = (availableHeight / labelHeightPx) * 100;
    const fitZoom = Math.min(zoomToFitWidth, zoomToFitHeight, 400);
    
    setZoom(Math.round(fitZoom));
  }, [labelMeta]);

  // Auto-fit on first load
  const hasAutoFittedRef = useRef(false);
  useEffect(() => {
    if (svgContent && labelMeta && !hasAutoFittedRef.current) {
      hasAutoFittedRef.current = true;
      const timer = setTimeout(handleFitToWindow, 100);
      return () => clearTimeout(timer);
    }
  }, [svgContent, labelMeta, handleFitToWindow]);

  // Compute viewBox position for display
  const getViewBoxDisplay = () => {
    if (!selectedElement || !viewBox || !labelMeta) return null;
    
    const vbPerInchX = viewBox.width / labelMeta.widthIn;
    const vbPerInchY = viewBox.height / labelMeta.heightIn;
    
    return {
      x: (selectedElement.placement.xIn * vbPerInchX).toFixed(1),
      y: (selectedElement.placement.yIn * vbPerInchY).toFixed(1),
      width: (selectedElement.placement.widthIn * vbPerInchX).toFixed(1),
      height: (selectedElement.placement.heightIn * vbPerInchY).toFixed(1),
      rotation: selectedElement.placement.rotation
    };
  };
  
  const vbDisplay = getViewBoxDisplay();

  return (
    <>
      <button
        onClick={handlePreview}
        className="text-blue-600 hover:text-blue-900 font-medium"
      >
        Preview
      </button>

      {/* Full-Screen Preview Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-gray-900">
          {/* Header Bar */}
          <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4">
            <div className="flex items-center gap-4">
              <h3 className="text-white font-medium">Label Preview</h3>
              <span className="text-gray-400 text-sm">{entityType}</span>

              {/* Preview Mode Toggle */}
              <div className="flex rounded-md overflow-hidden border border-gray-600">
                <button
                  type="button"
                  onClick={() => handleModeChange('single')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    previewMode === 'single'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Single
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('sheet')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    previewMode === 'sheet'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Sheet
                </button>
              </div>

              {/* Sheet Options */}
              {previewMode === 'sheet' && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.min(1000, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="w-16 px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white"
                  />
                  {sheetMeta && (
                    <span className="text-xs text-gray-400">
                      {sheetMeta.columns}×{sheetMeta.rows} · {sheetMeta.perSheet}/sheet
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Zoom Controls */}
              <div className="flex items-center gap-1 bg-gray-700 rounded px-2 py-1">
                <button
                  type="button"
                  onClick={() => setZoom(z => Math.max(25, z - 25))}
                  className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-white"
                  title="Zoom out"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <span className="text-xs text-gray-300 w-12 text-center font-mono">{zoom}%</span>
                <button
                  type="button"
                  onClick={() => setZoom(z => Math.min(400, z + 25))}
                  className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-white"
                  title="Zoom in"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={handleFitToWindow}
                  className="ml-1 px-2 py-0.5 text-xs text-gray-300 hover:text-white border-l border-gray-600"
                  title="Fit to window"
                >
                  Fit
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(100)}
                  className="px-2 py-0.5 text-xs text-gray-300 hover:text-white"
                  title="Reset to 100%"
                >
                  1:1
                </button>
              </div>

              {hasUnsavedChanges && (
                <span className="text-xs text-amber-400">● Unsaved</span>
              )}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isLoading}
                className="px-3 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                {isLoading ? '...' : '↻ Refresh'}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-gray-400 hover:text-white rounded"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Main Content - Sidebar + Preview */}
          <div className="flex h-[calc(100vh-48px)]">
            {/* Collapsible Sidebar */}
            <div className={`bg-gray-800 border-r border-gray-700 flex flex-col transition-all duration-200 ${
              sidebarCollapsed ? 'w-10' : 'w-72'
            }`}>
              {/* Collapse Toggle */}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="h-8 flex items-center justify-center text-gray-400 hover:text-white border-b border-gray-700"
              >
                <svg className={`w-4 h-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {!sidebarCollapsed && (
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {/* Element Info */}
                  <div className="bg-gray-750 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-gray-300">
                        {selectedElement ? `${selectedElement.type} Element` : 'No Selection'}
                      </label>
                      {selectedElement && (
                        <span className="text-xs font-mono text-blue-400">
                          {selectedElement.placement.widthIn.toFixed(2)}in
                        </span>
                      )}
                    </div>
                    
                    {selectedElement && (
                      <div className="space-y-2">
                        {/* Position in INCHES */}
                        <div className="text-xs text-gray-400">
                          <span className="text-gray-500">Position: </span>
                          {selectedElement.placement.xIn.toFixed(3)}, {selectedElement.placement.yIn.toFixed(3)} in
                        </div>
                        
                        {/* Size in INCHES */}
                        <div className="text-xs text-gray-400">
                          <span className="text-gray-500">Size: </span>
                          {selectedElement.placement.widthIn.toFixed(3)} × {selectedElement.placement.heightIn.toFixed(3)} in
                        </div>
                        
                        {/* Rotation */}
                        <div className="text-xs text-gray-400">
                          <span className="text-gray-500">Rotation: </span>
                          {selectedElement.placement.rotation}°
                        </div>
                        
                        {/* ViewBox units (debug display) */}
                        {vbDisplay && (
                          <div className="mt-2 pt-2 border-t border-gray-700">
                            <div className="text-xs text-gray-500 mb-1">ViewBox Units:</div>
                            <div className="text-xs font-mono text-green-400">
                              {vbDisplay.x}, {vbDisplay.y} ({vbDisplay.width}×{vbDisplay.height})
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Rotation Controls */}
                  {selectedElement && (
                    <div className="bg-gray-750 rounded-lg p-3">
                      <label className="text-xs font-medium text-gray-300 block mb-2">Rotation</label>
                      <div className="flex gap-1">
                        {([0, 90, -90] as Rotation[]).map((rot) => (
                          <button
                            key={rot}
                            onClick={() => handleRotate(rot)}
                            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                              selectedElement.placement.rotation === rot
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                          >
                            {rot === 0 ? '0°' : rot === 90 ? '+90°' : '-90°'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Label Info */}
                  {labelMeta && (
                    <div className="bg-gray-750 rounded-lg p-3">
                      <label className="text-xs font-medium text-gray-300 block mb-2">Label Size</label>
                      <p className="text-xs text-gray-400">
                        {labelMeta.widthIn.toFixed(2)} × {labelMeta.heightIn.toFixed(2)} in
                      </p>
                      {viewBox && (
                        <p className="text-xs text-gray-500 mt-1">
                          ViewBox: {viewBox.width.toFixed(0)} × {viewBox.height.toFixed(0)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleSavePosition}
                      disabled={!hasUnsavedChanges || isSaving}
                      className={`w-full px-3 py-2 text-sm font-medium rounded transition-colors ${
                        hasUnsavedChanges
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {isSaving ? 'Saving...' : 'Save Position'}
                    </button>
                    {hasUnsavedChanges && (
                      <button
                        type="button"
                        onClick={handleResetPosition}
                        className="w-full px-2 py-1.5 text-xs text-gray-400 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600"
                      >
                        Revert Changes
                      </button>
                    )}
                  </div>

                  {/* Instructions */}
                  <div className="text-xs text-gray-500 p-2 bg-gray-900/50 rounded">
                    <p>💡 Drag to move</p>
                    <p className="mt-1">↘ Drag corner to resize</p>
                    <p className="mt-1">🔄 Use rotation handle or buttons</p>
                  </div>
                </div>
              )}
            </div>

            {/* Preview Area */}
            <div 
              ref={previewAreaRef}
              className="flex-1 bg-gray-950 flex items-center justify-center overflow-auto"
            >
              {isLoading ? (
                <div className="text-center">
                  <svg className="animate-spin h-10 w-10 text-blue-500 mx-auto" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="mt-3 text-sm text-gray-400">Loading preview...</p>
                </div>
              ) : error ? (
                <div className="text-center max-w-md">
                  <svg className="h-16 w-16 text-red-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-lg font-medium text-red-400 mb-2">Preview Error</p>
                  <p className="text-sm text-gray-400">{error}</p>
                </div>
              ) : svgContent ? (
                <div className="p-10">
                  {/* 
                    STAGE WRAPPER - Critical for Moveable alignment
                    - position: relative (for absolute positioning of overlay)
                    - Uses actual width/height for zoom (NOT CSS transform scale)
                    - This ensures SVG renders at full resolution at any zoom level
                    - This div is the rootContainer for Moveable
                  */}
                  <div 
                    ref={stageRef}
                    className="relative bg-white rounded-lg shadow-2xl"
                    style={{
                      // Use actual dimensions for zoom - NOT transform scale
                      // This ensures SVG renders at full resolution (no blurriness)
                      width: labelMeta ? `${labelMeta.widthIn * (zoom / 100)}in` : 'auto',
                      height: labelMeta ? `${labelMeta.heightIn * (zoom / 100)}in` : 'auto',
                    }}
                  >
                    {/* Base SVG (with QR injected by server) */}
                    <div 
                      dangerouslySetInnerHTML={{ __html: svgContent }}
                      className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                    />
                    
                    {/* SVG Interaction Layer - only for single label mode */}
                    {previewMode === 'single' && labelMeta && viewBox && (
                      <SvgInteractionLayer
                        element={selectedElement}
                        viewBoxWidth={viewBox.width}
                        viewBoxHeight={viewBox.height}
                        labelWidthIn={labelMeta.widthIn}
                        labelHeightIn={labelMeta.heightIn}
                        onElementChange={handleElementChange}
                        disabled={false}
                        zoom={zoom / 100}
                        stageRef={stageRef}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500">
                  <p>Click Refresh to load preview</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
