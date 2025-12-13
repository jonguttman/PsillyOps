'use client';

import { useState, useEffect, useCallback } from 'react';

interface LabelPreviewButtonProps {
  versionId: string;
  entityType: string;
  initialQrScale?: number;
  initialQrOffsetX?: number;
  initialQrOffsetY?: number;
}

type PreviewMode = 'single' | 'sheet';

export default function LabelPreviewButton({ 
  versionId, 
  entityType,
  initialQrScale = 1.0,
  initialQrOffsetX = 0,
  initialQrOffsetY = 0
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
  
  // QR Position state
  const [qrScale, setQrScale] = useState(initialQrScale);
  const [qrOffsetX, setQrOffsetX] = useState(initialQrOffsetX);
  const [qrOffsetY, setQrOffsetY] = useState(initialQrOffsetY);
  
  // Saved values
  const [savedQrScale, setSavedQrScale] = useState(initialQrScale);
  const [savedQrOffsetX, setSavedQrOffsetX] = useState(initialQrOffsetX);
  const [savedQrOffsetY, setSavedQrOffsetY] = useState(initialQrOffsetY);
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Track if values have changed from saved values
  useEffect(() => {
    setHasUnsavedChanges(
      qrScale !== savedQrScale || 
      qrOffsetX !== savedQrOffsetX || 
      qrOffsetY !== savedQrOffsetY
    );
  }, [qrScale, qrOffsetX, qrOffsetY, savedQrScale, savedQrOffsetX, savedQrOffsetY]);

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
        setQrScale(version.qrScale ?? 1.0);
        setQrOffsetX(version.qrOffsetX ?? 0);
        setQrOffsetY(version.qrOffsetY ?? 0);
        setSavedQrScale(version.qrScale ?? 1.0);
        setSavedQrOffsetX(version.qrOffsetX ?? 0);
        setSavedQrOffsetY(version.qrOffsetY ?? 0);
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
        ? { versionId, qrScale, qrOffsetX, qrOffsetY }
        : { versionId, quantity, qrScale, qrOffsetX, qrOffsetY };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to load preview');
      }

      const svg = await response.text();
      setSvgContent(svg);

      if (previewMode === 'sheet') {
        const cols = parseInt(response.headers.get('X-Label-Columns') || '0', 10);
        const rows = parseInt(response.headers.get('X-Label-Rows') || '0', 10);
        const perSheet = parseInt(response.headers.get('X-Label-Per-Sheet') || '0', 10);
        const rotationUsed = (response.headers.get('X-Label-Rotation-Used') || 'false') === 'true';
        const totalSheets = parseInt(response.headers.get('X-Label-Total-Sheets') || '0', 10);
        setSheetMeta({ columns: cols, rows, perSheet, rotationUsed, totalSheets });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load preview');
    } finally {
      setIsLoading(false);
    }
  }, [previewMode, versionId, quantity, qrScale, qrOffsetX, qrOffsetY]);

  // Debounced preview update when position changes
  useEffect(() => {
    if (!isOpen) return;
    
    const timer = setTimeout(() => {
      loadPreview();
    }, 300);

    return () => clearTimeout(timer);
  }, [qrScale, qrOffsetX, qrOffsetY, isOpen, loadPreview]);

  const handleModeChange = (mode: PreviewMode) => {
    setPreviewMode(mode);
  };

  const handleRefresh = () => {
    loadPreview();
  };

  const handleScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newScale = parseFloat(e.target.value);
    setQrScale(newScale);
  };

  // Nudge functions with configurable step
  const nudgeStep = 2; // SVG units per nudge

  const nudgeLeft = () => setQrOffsetX(prev => prev - nudgeStep);
  const nudgeRight = () => setQrOffsetX(prev => prev + nudgeStep);
  const nudgeUp = () => setQrOffsetY(prev => prev - nudgeStep);
  const nudgeDown = () => setQrOffsetY(prev => prev + nudgeStep);

  const handleSavePosition = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/labels/versions/${versionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrScale, qrOffsetX, qrOffsetY })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || 'Failed to save position');
      }

      setSavedQrScale(qrScale);
      setSavedQrOffsetX(qrOffsetX);
      setSavedQrOffsetY(qrOffsetY);
      setHasUnsavedChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPosition = () => {
    setQrScale(savedQrScale);
    setQrOffsetX(savedQrOffsetX);
    setQrOffsetY(savedQrOffsetY);
  };

  return (
    <>
      <button
        onClick={handlePreview}
        className="text-blue-600 hover:text-blue-900 font-medium"
      >
        Preview
      </button>

      {/* Preview Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => setIsOpen(false)}
            />

            {/* Modal Panel */}
            <div className="relative inline-block bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:w-full sm:max-w-5xl">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      Label Preview
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {entityType} template
                    </p>
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

                {/* Preview Mode Toggle */}
                <div className="mb-4 flex flex-wrap items-center gap-4">
                  <div className="flex rounded-md shadow-sm">
                    <button
                      type="button"
                      onClick={() => handleModeChange('single')}
                      className={`px-4 py-2 text-sm font-medium rounded-l-md border ${
                        previewMode === 'single'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Single Label
                    </button>
                    <button
                      type="button"
                      onClick={() => handleModeChange('sheet')}
                      className={`px-4 py-2 text-sm font-medium rounded-r-md border-t border-b border-r ${
                        previewMode === 'sheet'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Sheet Preview
                    </button>
                  </div>

                  {/* Sheet Options */}
                  {previewMode === 'sheet' && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <label htmlFor="quantity" className="text-sm text-gray-600">Qty:</label>
                        <input
                          type="number"
                          id="quantity"
                          min={1}
                          max={1000}
                          value={quantity}
                          onChange={(e) => setQuantity(Math.min(1000, Math.max(1, parseInt(e.target.value) || 1)))}
                          className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md"
                        />
                      </div>
                      {sheetMeta && (
                        <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-2 py-1">
                          {sheetMeta.columns}×{sheetMeta.rows} • {sheetMeta.perSheet}/sheet • rot {sheetMeta.rotationUsed ? '90°' : 'none'} • {sheetMeta.totalSheets} sheet(s)
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={isLoading}
                    className="ml-auto px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-300 rounded-md hover:bg-blue-50 disabled:opacity-50"
                  >
                    {isLoading ? 'Loading...' : 'Refresh'}
                  </button>
                </div>

                {/* QR Position Controls */}
                <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Scale Slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="qrScale" className="text-sm font-medium text-gray-700">
                          QR Size
                        </label>
                        <span className="text-sm font-mono text-gray-600">
                          {Math.round(qrScale * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        id="qrScale"
                        min="0.1"
                        max="1.5"
                        step="0.05"
                        value={qrScale}
                        onChange={handleScaleChange}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>10%</span>
                        <span>50%</span>
                        <span>100%</span>
                        <span>150%</span>
                      </div>
                    </div>

                    {/* Position Nudge Controls */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-medium text-gray-700">
                          Position Offset
                        </label>
                        <span className="text-xs font-mono text-gray-500">
                          X: {qrOffsetX.toFixed(0)} | Y: {qrOffsetY.toFixed(0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-center gap-1">
                        {/* Directional pad */}
                        <div className="grid grid-cols-3 gap-0.5">
                          <div /> {/* Empty top-left */}
                          <button
                            type="button"
                            onClick={nudgeUp}
                            className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
                            title="Move Up"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <div /> {/* Empty top-right */}
                          
                          <button
                            type="button"
                            onClick={nudgeLeft}
                            className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
                            title="Move Left"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => { setQrOffsetX(0); setQrOffsetY(0); }}
                            className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-600 text-xs font-medium"
                            title="Center"
                          >
                            ⊙
                          </button>
                          <button
                            type="button"
                            onClick={nudgeRight}
                            className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
                            title="Move Right"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          
                          <div /> {/* Empty bottom-left */}
                          <button
                            type="button"
                            onClick={nudgeDown}
                            className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-600"
                            title="Move Down"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          <div /> {/* Empty bottom-right */}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Save/Reset Buttons */}
                  <div className="mt-4 flex items-center justify-between border-t border-gray-200 pt-4">
                    <div>
                      {hasUnsavedChanges && (
                        <p className="text-xs text-amber-600">
                          ⚠️ Unsaved changes – click "Save Position" to apply to all printed labels
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {hasUnsavedChanges && (
                        <button
                          type="button"
                          onClick={handleResetPosition}
                          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                          Reset
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSavePosition}
                        disabled={!hasUnsavedChanges || isSaving}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md ${
                          hasUnsavedChanges
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        } disabled:opacity-50`}
                      >
                        {isSaving ? 'Saving...' : 'Save Position'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Preview Area */}
                <div className="relative border rounded-lg p-4 bg-gray-50 min-h-80 flex items-center justify-center overflow-auto">
                  {isLoading ? (
                    <div className="text-center">
                      <svg className="animate-spin h-8 w-8 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <p className="mt-2 text-sm text-gray-500">Loading preview...</p>
                    </div>
                  ) : error ? (
                    <div className="text-center text-gray-500 max-w-md">
                      <svg className="h-12 w-12 text-red-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <p className="text-sm font-medium text-red-600 mb-1">Preview Error</p>
                      <p className="text-sm text-gray-500">{error}</p>
                    </div>
                  ) : svgContent ? (
                    <>
                      {/* Preview Watermark */}
                      <div className="absolute top-2 right-2 px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded border border-amber-200">
                        PREVIEW – NOT TRACEABLE
                      </div>
                      <div 
                        className="w-full max-h-[60vh] overflow-auto"
                        dangerouslySetInnerHTML={{ __html: svgContent }}
                      />
                    </>
                  ) : (
                    <div className="text-center text-gray-500">
                      <p>Click Refresh to load preview</p>
                    </div>
                  )}
                </div>

                {/* Info Banner - Fixed text wrapping */}
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <svg className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-blue-700 min-w-0">
                      <p className="break-words">
                        This is a template preview using a fixed dummy QR token (qr_PREVIEW_TOKEN_DO_NOT_USE). Actual QR codes are generated with unique tokens when printing labels for products, batches, or inventory items.
                      </p>
                      <p className="mt-2 font-medium break-words">
                        QR size and position settings are saved with the label version and apply to all printed labels.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:w-auto sm:text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
