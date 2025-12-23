'use client';

/**
 * Unified Seal Sheet Generator + Printer
 * 
 * Two modes:
 * 1. Generate New Seal Sheet - Creates SealSheet + tokens, then generates PDF
 * 2. Print Existing Seal Sheet - Prints from existing sheet (read-only, no token creation)
 * 
 * CORE CONCEPTS:
 * - A SealSheet is a logical container of tokens
 * - A PDF is a rendering of a SealSheet with a chosen layout
 * - Seal size and spacing are print-time decisions (not persisted)
 * - The print path is read-only with respect to SealSheet and Token records
 */

import { useState, useEffect, useCallback } from 'react';
import { MAX_TOKENS_PER_BATCH } from '@/lib/constants/seal';
import Link from 'next/link';
import {
  SEAL_SIZES_IN,
  SPACING_MIN_IN,
  SPACING_MAX_IN,
  SPACING_STEP_IN,
  DEFAULT_SPACING_IN,
  DEFAULT_MARGIN_IN,
  PAPER_SIZES,
  calculateGridLayout,
  getPaperDimensions,
  type PaperType,
  type SealSizeIn,
} from '@/lib/utils/sealPrintLayout';

// ========================================
// TYPES
// ========================================

type SheetMode = 'generate-sheet' | 'print-sheet';
type PaperSize = 'LETTER' | 'A4' | 'CUSTOM';

interface OperationResult {
  success: boolean;
  message: string;
  sheetId?: string;
  pageCount?: number;
  sealsPerSheet?: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface PrintableSheet {
  id: string;
  partnerName: string | null;
  partnerId: string | null;
  tokenCount: number;
  printedCount: number;
  remainingCount: number;
  status: string;
  createdAt: string;
  sealVersion: string;
}

interface LayoutPreview {
  columns: number;
  rows: number;
  sealsPerSheet: number;
  pagesNeeded: number;
}

// ========================================
// COMPONENT
// ========================================

export function SealsClient() {
  // Mode selection
  const [mode, setMode] = useState<SheetMode>('generate-sheet');
  
  // Generate mode state
  const [quantity, setQuantity] = useState<number>(10);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  
  // Print mode state
  const [sheets, setSheets] = useState<PrintableSheet[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState<string>('');
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  
  // Print layout options (PDF options, not sheet properties)
  const [paperSize, setPaperSize] = useState<PaperSize>('LETTER');
  const [customWidth, setCustomWidth] = useState<number>(8.5);
  const [customHeight, setCustomHeight] = useState<number>(11);
  const [sealDiameter, setSealDiameter] = useState<SealSizeIn>(1.0);
  const [spacing, setSpacing] = useState<number>(DEFAULT_SPACING_IN);
  
  // Operation state
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<OperationResult | null>(null);
  
  // Live preset info (for display)
  const [livePresetName, setLivePresetName] = useState<string | null>(null);
  
  // Maximum sheets at once (for generation)
  const MAX_SHEETS_AT_ONCE = 10;

  // ========================================
  // LOAD PRODUCTS (for generate mode)
  // ========================================

  useEffect(() => {
    const loadProducts = async () => {
      setIsLoadingProducts(true);
      try {
        const response = await fetch('/api/products?limit=100&active=true');
        if (response.ok) {
          const data = await response.json();
          setProducts(data.products || []);
        }
      } catch (error) {
        console.error('Failed to load products:', error);
      } finally {
        setIsLoadingProducts(false);
      }
    };
    
    const loadLivePreset = async () => {
      try {
        const response = await fetch('/api/seals/tuner/live');
        if (response.ok) {
          const data = await response.json();
          setLivePresetName(data.livePreset?.name || null);
        }
      } catch {
        // Silently fail
      }
    };
    
    loadProducts();
    loadLivePreset();
  }, []);

  // ========================================
  // LOAD SHEETS (for print mode)
  // ========================================

  const loadSheets = useCallback(async () => {
    setIsLoadingSheets(true);
    setSheetsError(null);

    try {
      const response = await fetch('/api/seals/print-layout');
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load sheets');
      }

      const data = await response.json();
      setSheets(data.sheets);
    } catch (error) {
      setSheetsError(error instanceof Error ? error.message : 'Failed to load sheets');
    } finally {
      setIsLoadingSheets(false);
    }
  }, []);

  // Load sheets when switching to print mode
  useEffect(() => {
    if (mode === 'print-sheet') {
      loadSheets();
    }
  }, [mode, loadSheets]);

  // ========================================
  // LAYOUT PREVIEW CALCULATION
  // ========================================

  const calculatePreview = useCallback((): LayoutPreview | null => {
    try {
      const paper = getPaperDimensions(
        paperSize,
        paperSize === 'CUSTOM' ? customWidth : undefined,
        paperSize === 'CUSTOM' ? customHeight : undefined
      );

      const layout = calculateGridLayout({
        sealDiameterIn: sealDiameter,
        spacingIn: spacing,
        paper,
        marginIn: DEFAULT_MARGIN_IN,
      });

      const totalSeals = mode === 'generate-sheet' 
        ? quantity 
        : (sheets.find(s => s.id === selectedSheetId)?.tokenCount ?? 0);

      const pagesNeeded = layout.sealsPerSheet > 0 
        ? Math.ceil(totalSeals / layout.sealsPerSheet) 
        : 0;

      return {
        columns: layout.columns,
        rows: layout.rows,
        sealsPerSheet: layout.sealsPerSheet,
        pagesNeeded,
      };
    } catch {
      return null;
    }
  }, [paperSize, customWidth, customHeight, sealDiameter, spacing, mode, quantity, sheets, selectedSheetId]);

  const preview = calculatePreview();
  const selectedSheet = sheets.find(s => s.id === selectedSheetId);

  // ========================================
  // VALIDATION
  // ========================================

  const isValid = () => {
    if (mode === 'generate-sheet') {
      return quantity > 0 && quantity <= MAX_TOKENS_PER_BATCH;
    } else {
      return selectedSheetId !== '' && selectedSheet && selectedSheet.tokenCount > 0;
    }
  };

  // ========================================
  // GENERATE SHEET + PDF
  // ========================================

  const handleGenerateSheet = async () => {
    if (!isValid()) {
      setResult({ 
        success: false, 
        message: 'Please enter a valid quantity (1-250)' 
      });
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      // Generate sheet + PDF via existing API
      const response = await fetch('/api/seals/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity,
          productId: selectedProductId || undefined,
          config: {
            paperSize: paperSize.toLowerCase(),
            sealDiameter,
            marginIn: DEFAULT_MARGIN_IN,
            spacingIn: spacing,
            ...(paperSize === 'CUSTOM' && { customWidth, customHeight }),
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate seal sheet');
      }

      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tripdar-seals-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setResult({
        success: true,
        message: `Successfully created ${quantity} seal tokens and generated PDF`,
        pageCount: preview?.pagesNeeded,
        sealsPerSheet: preview?.sealsPerSheet,
      });

      // Refresh sheets list so new sheet appears
      loadSheets();
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // ========================================
  // PRINT EXISTING SHEET (READ-ONLY)
  // ========================================

  const handlePrintSheet = async () => {
    // GUARD: Print mode must never create tokens
    if (mode !== 'print-sheet') {
      throw new Error('INVALID_PRINT_ATTEMPT: Print handler called in wrong mode');
    }

    if (!selectedSheetId || !selectedSheet) {
      setResult({ 
        success: false, 
        message: 'Please select a seal sheet to print' 
      });
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      // Use the print-layout API which is read-only
      const response = await fetch('/api/seals/print-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sealSheetId: selectedSheetId,
          sealDiameterIn: sealDiameter,
          spacingIn: spacing,
          paperType: paperSize,
          customWidthIn: paperSize === 'CUSTOM' ? customWidth : undefined,
          customHeightIn: paperSize === 'CUSTOM' ? customHeight : undefined,
          marginIn: DEFAULT_MARGIN_IN,
          includeRegistrationMarks: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to print seal sheet');
      }

      // Get job info from headers
      const jobId = response.headers.get('X-Print-Job-Id');
      const sealCount = response.headers.get('X-Seal-Count');
      const pageCount = response.headers.get('X-Page-Count');

      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tripdar-seals-${jobId || selectedSheetId}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setResult({
        success: true,
        message: `Successfully generated PDF with ${sealCount} seals — no new tokens created`,
        sheetId: jobId ?? undefined,
        pageCount: pageCount ? parseInt(pageCount) : undefined,
      });
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">TripDAR Seal Sheets</h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate new seal sheets or reprint existing ones
            {livePresetName && (
              <span className="ml-2 inline-flex items-center gap-1 text-green-600">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Design: {livePresetName}
              </span>
            )}
          </p>
        </div>
        <Link
          href="/ops/system/seals"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Seal Settings
        </Link>
      </div>
      
      {/* Mode Selection */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">What would you like to do?</h2>
        <div className="flex gap-4">
          <label className={`flex-1 relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
            mode === 'generate-sheet' 
              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500' 
              : 'border-gray-300 bg-white hover:bg-gray-50'
          }`}>
            <input
              type="radio"
              name="mode"
              value="generate-sheet"
              checked={mode === 'generate-sheet'}
              onChange={() => setMode('generate-sheet')}
              className="sr-only"
            />
            <div className="flex flex-col">
              <span className={`block text-sm font-medium ${mode === 'generate-sheet' ? 'text-blue-900' : 'text-gray-900'}`}>
                Generate New Seal Sheet
              </span>
              <span className={`mt-1 text-sm ${mode === 'generate-sheet' ? 'text-blue-700' : 'text-gray-500'}`}>
                Create a new batch of seal tokens and generate print-ready PDF
              </span>
            </div>
            {mode === 'generate-sheet' && (
              <svg className="h-5 w-5 text-blue-600 absolute top-4 right-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </label>
          
          <label className={`flex-1 relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
            mode === 'print-sheet' 
              ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500' 
              : 'border-gray-300 bg-white hover:bg-gray-50'
          }`}>
            <input
              type="radio"
              name="mode"
              value="print-sheet"
              checked={mode === 'print-sheet'}
              onChange={() => setMode('print-sheet')}
              className="sr-only"
            />
            <div className="flex flex-col">
              <span className={`block text-sm font-medium ${mode === 'print-sheet' ? 'text-emerald-900' : 'text-gray-900'}`}>
                Print Existing Seal Sheet
              </span>
              <span className={`mt-1 text-sm ${mode === 'print-sheet' ? 'text-emerald-700' : 'text-gray-500'}`}>
                Print seals from a sheet that already exists
              </span>
            </div>
            {mode === 'print-sheet' && (
              <svg className="h-5 w-5 text-emerald-600 absolute top-4 right-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </label>
        </div>
      </div>

      {/* Generate Mode: Seal Details */}
      {mode === 'generate-sheet' && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Seal Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 mb-2">
                Number of Seals
              </label>
              <input
                type="number"
                id="quantity"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Math.min(MAX_TOKENS_PER_BATCH, parseInt(e.target.value) || 1)))}
                min="1"
                max={MAX_TOKENS_PER_BATCH}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
              <p className="mt-1 text-sm text-gray-500">
                Maximum {MAX_TOKENS_PER_BATCH} seals per batch, {MAX_SHEETS_AT_ONCE} sheets at a time
              </p>
            </div>
            
            <div>
              <label htmlFor="product" className="block text-sm font-medium text-gray-700 mb-2">
                Link to Product (Optional)
              </label>
              <select
                id="product"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                disabled={isLoadingProducts}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="">No product (standalone seals)</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.sku})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-gray-500">
                Seals can be assigned to partners later
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Print Mode: Sheet Selection */}
      {mode === 'print-sheet' && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Select Seal Sheet to Reprint</h2>
          <p className="text-sm text-gray-500 mb-4">
            Showing unassigned sheets from the last 10 days, most recent first.
          </p>
          
          {isLoadingSheets ? (
            <div className="text-sm text-gray-500">Loading sheets...</div>
          ) : sheetsError ? (
            <div className="text-sm text-red-600">{sheetsError}</div>
          ) : sheets.length === 0 ? (
            <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
              No unassigned seal sheets from the last 10 days. Generate a new sheet first.
            </div>
          ) : (
            <>
              <select
                value={selectedSheetId}
                onChange={(e) => setSelectedSheetId(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 sm:text-sm"
              >
                <option value="">Select a sheet to reprint...</option>
                {sheets.map((sheet) => {
                  const createdDate = new Date(sheet.createdAt);
                  const daysAgo = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
                  const dateLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
                  return (
                    <option key={sheet.id} value={sheet.id}>
                      {dateLabel} · {sheet.tokenCount} seals · {sheet.id.slice(0, 8)}...
                    </option>
                  );
                })}
              </select>

              {selectedSheet && (
                <div className="mt-4 bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Sheet Info</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Created:</span>{' '}
                      <span className="font-medium">{new Date(selectedSheet.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Seals:</span>{' '}
                      <span className="font-medium">{selectedSheet.tokenCount}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Version:</span>{' '}
                      <span className="font-medium">{selectedSheet.sealVersion}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Print Layout Options (PDF options, not sheet properties) */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-1">Print Layout</h2>
        <p className="text-sm text-gray-500 mb-4">These are PDF options — they do not modify the seal sheet</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Paper Size */}
          <div>
            <label htmlFor="paperSize" className="block text-sm font-medium text-gray-700 mb-2">
              Paper Size
            </label>
            <select
              id="paperSize"
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as PaperSize)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="LETTER">US Letter (8.5&quot; × 11&quot;)</option>
              <option value="A4">A4 (210mm × 297mm)</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>

          {/* Custom Dimensions */}
          {paperSize === 'CUSTOM' && (
            <>
              <div>
                <label htmlFor="customWidth" className="block text-sm font-medium text-gray-700 mb-2">
                  Width (inches)
                </label>
                <input
                  type="number"
                  id="customWidth"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(parseFloat(e.target.value) || 8.5)}
                  step="0.1"
                  min="1"
                  max="24"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="customHeight" className="block text-sm font-medium text-gray-700 mb-2">
                  Height (inches)
                </label>
                <input
                  type="number"
                  id="customHeight"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(parseFloat(e.target.value) || 11)}
                  step="0.1"
                  min="1"
                  max="24"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
            </>
          )}

          {/* Seal Diameter */}
          <div>
            <label htmlFor="sealDiameter" className="block text-sm font-medium text-gray-700 mb-2">
              Seal Diameter
            </label>
            <div className="flex gap-2">
              {SEAL_SIZES_IN.map((size) => (
                <button
                  key={size}
                  onClick={() => setSealDiameter(size)}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    sealDiameter === size
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {size === 1 ? '1"' : `${size}"`}
                </button>
              ))}
            </div>
          </div>

          {/* Spacing */}
          <div className={paperSize === 'CUSTOM' ? 'lg:col-span-4' : ''}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Spacing: {spacing.toFixed(2)}&quot;
            </label>
            <input
              type="range"
              min={SPACING_MIN_IN}
              max={SPACING_MAX_IN}
              step={SPACING_STEP_IN}
              value={spacing}
              onChange={(e) => setSpacing(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{SPACING_MIN_IN}&quot; (tight)</span>
              <span>{SPACING_MAX_IN}&quot; (loose)</span>
            </div>
          </div>
        </div>

        {/* Layout Preview */}
        {preview && preview.sealsPerSheet > 0 && (
          <div className="mt-6 bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Layout Preview</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Grid:</span>{' '}
                <span className="font-medium">{preview.columns} × {preview.rows} = {preview.sealsPerSheet} seals/page</span>
              </div>
              <div>
                <span className="text-gray-500">Pages needed:</span>{' '}
                <span className="font-medium">{preview.pagesNeeded}</span>
              </div>
              <div>
                <span className="text-gray-500">Total seals:</span>{' '}
                <span className="font-medium">
                  {mode === 'generate-sheet' ? quantity : (selectedSheet?.tokenCount ?? 0)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Button */}
      <div className="bg-white shadow rounded-lg p-6">
        {mode === 'generate-sheet' ? (
          <>
            <button
              onClick={handleGenerateSheet}
              disabled={isProcessing || !isValid()}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Generate Seal Sheet + PDF
                </>
              )}
            </button>
            <p className="mt-2 text-sm text-gray-500">
              This will create {quantity} new seal tokens and generate a print-ready PDF
            </p>
          </>
        ) : (
          <>
            <button
              onClick={handlePrintSheet}
              disabled={isProcessing || !isValid()}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Printing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print Seal Sheet
                </>
              )}
            </button>
            <p className="mt-2 text-sm text-gray-500">
              This will generate a PDF from existing tokens — no new tokens created
            </p>
          </>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-lg p-4 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex">
            <div className="flex-shrink-0">
              {result.success ? (
                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div className="ml-3">
              <p className={`text-sm font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                {result.message}
              </p>
              {result.pageCount && result.sealsPerSheet && (
                <p className="mt-1 text-sm text-green-700">
                  {result.sealsPerSheet} seals per sheet across {result.pageCount} page(s)
                </p>
              )}
              {result.sheetId && (
                <p className="mt-1 text-sm text-green-700">
                  Job ID: <code className="font-mono text-xs bg-green-100 px-1 py-0.5 rounded">{result.sheetId}</code>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
