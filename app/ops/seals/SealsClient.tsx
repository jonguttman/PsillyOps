'use client';

import { useState, useEffect } from 'react';
import { SEAL_DIAMETER_PRESETS, DEFAULT_SEAL_DIAMETER, MAX_TOKENS_PER_BATCH } from '@/lib/constants/seal';
import SealTunerPanel from '@/components/seals/SealTunerPanel';

type PaperSize = 'letter' | 'a4' | 'custom';
type GenerationMode = 'generate' | 'existing';

interface GenerationResult {
  success: boolean;
  message: string;
  pageCount?: number;
  sealsPerSheet?: number;
  tokensCreated?: number;
  sheetId?: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
}

export function SealsClient() {
  // Mode selection
  const [mode, setMode] = useState<GenerationMode>('generate');
  
  // Generate mode state
  const [quantity, setQuantity] = useState<number>(10);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  
  // Existing tokens mode state
  const [tokens, setTokens] = useState<string>('');
  
  // Shared state
  const [paperSize, setPaperSize] = useState<PaperSize>('letter');
  const [customWidth, setCustomWidth] = useState<number>(8.5);
  const [customHeight, setCustomHeight] = useState<number>(11);
  const [sealDiameter, setSealDiameter] = useState<number>(DEFAULT_SEAL_DIAMETER);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  
  // Tuner panel state
  const [isTunerOpen, setIsTunerOpen] = useState(false);

  // Load products for optional product selection
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
    loadProducts();
  }, []);

  const tokenList = tokens
    .split(/[\n,]/)
    .map(t => t.trim())
    .filter(t => t.length > 0);

  const getEffectiveCount = () => {
    return mode === 'generate' ? quantity : tokenList.length;
  };

  const isValid = () => {
    const count = getEffectiveCount();
    if (count === 0) return false;
    if (count > MAX_TOKENS_PER_BATCH) return false;
    return true;
  };

  const buildConfig = () => ({
    paperSize,
    sealDiameter,
    marginIn: 0.25,
    ...(paperSize === 'custom' && {
      customWidth,
      customHeight,
    }),
  });

  const handleGeneratePdf = async () => {
    if (!isValid()) {
      setResult({ 
        success: false, 
        message: mode === 'generate' 
          ? 'Please enter a valid quantity (1-250)' 
          : 'Please enter at least one token' 
      });
      return;
    }

    setIsGenerating(true);
    setResult(null);

    try {
      const config = buildConfig();
      
      const body = mode === 'generate'
        ? { 
            quantity, 
            productId: selectedProductId || undefined,
            config 
          }
        : { 
            tokens: tokenList, 
            config 
          };

      const response = await fetch('/api/seals/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate PDF');
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

      const count = getEffectiveCount();
      setResult({
        success: true,
        message: mode === 'generate'
          ? `Successfully created ${count} new seal(s) and generated PDF`
          : `Successfully generated PDF with ${count} seal(s)`,
        tokensCreated: mode === 'generate' ? count : undefined,
      });
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateSvg = async () => {
    if (!isValid()) {
      setResult({ 
        success: false, 
        message: mode === 'generate' 
          ? 'Please enter a valid quantity (1-250)' 
          : 'Please enter at least one token' 
      });
      return;
    }

    setIsGenerating(true);
    setResult(null);

    try {
      const config = buildConfig();
      
      const body = mode === 'generate'
        ? { 
            quantity, 
            productId: selectedProductId || undefined,
            config 
          }
        : { 
            tokens: tokenList, 
            config 
          };

      const response = await fetch('/api/seals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate seals');
      }

      const data = await response.json();

      // Download each sheet SVG
      data.sheetSvgs.forEach((svg: string, index: number) => {
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tripdar-seals-sheet-${index + 1}.svg`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      });

      const count = getEffectiveCount();
      setResult({
        success: true,
        message: mode === 'generate'
          ? `Successfully created ${count} new seal(s) across ${data.pageCount} sheet(s)`
          : `Successfully generated ${data.pageCount} sheet(s) with ${count} seal(s)`,
        pageCount: data.pageCount,
        sealsPerSheet: data.sealsPerSheet,
        tokensCreated: mode === 'generate' ? count : undefined,
        sheetId: data.sheetId,
      });
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tuner Panel */}
      <SealTunerPanel 
        isOpen={isTunerOpen} 
        onClose={() => setIsTunerOpen(false)} 
      />
      
      {/* Header with Tuner Button */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">TripDAR Seal Generator</h1>
          <p className="text-sm text-gray-500 mt-1">Generate print-ready seal sheets with QR codes</p>
        </div>
        <button
          onClick={() => setIsTunerOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Seal Tuner
        </button>
      </div>
      
      {/* Mode Selection */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Generation Mode</h2>
        <div className="flex gap-4">
          <label className={`flex-1 relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
            mode === 'generate' 
              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500' 
              : 'border-gray-300 bg-white hover:bg-gray-50'
          }`}>
            <input
              type="radio"
              name="mode"
              value="generate"
              checked={mode === 'generate'}
              onChange={() => setMode('generate')}
              className="sr-only"
            />
            <div className="flex flex-col">
              <span className={`block text-sm font-medium ${mode === 'generate' ? 'text-blue-900' : 'text-gray-900'}`}>
                Generate New Seals
              </span>
              <span className={`mt-1 text-sm ${mode === 'generate' ? 'text-blue-700' : 'text-gray-500'}`}>
                Create new tokens and seals in one step
              </span>
            </div>
            {mode === 'generate' && (
              <svg className="h-5 w-5 text-blue-600 absolute top-4 right-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </label>
          
          <label className={`flex-1 relative flex cursor-pointer rounded-lg border p-4 focus:outline-none ${
            mode === 'existing' 
              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500' 
              : 'border-gray-300 bg-white hover:bg-gray-50'
          }`}>
            <input
              type="radio"
              name="mode"
              value="existing"
              checked={mode === 'existing'}
              onChange={() => setMode('existing')}
              className="sr-only"
            />
            <div className="flex flex-col">
              <span className={`block text-sm font-medium ${mode === 'existing' ? 'text-blue-900' : 'text-gray-900'}`}>
                Use Existing Tokens
              </span>
              <span className={`mt-1 text-sm ${mode === 'existing' ? 'text-blue-700' : 'text-gray-500'}`}>
                Generate seals for tokens you already have
              </span>
            </div>
            {mode === 'existing' && (
              <svg className="h-5 w-5 text-blue-600 absolute top-4 right-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </label>
        </div>
      </div>

      {/* Generate Mode: Quantity & Product */}
      {mode === 'generate' && (
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
                Maximum {MAX_TOKENS_PER_BATCH} seals per batch
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
                {selectedProductId 
                  ? 'Seals will be linked to this product for tracking' 
                  : 'Seals can be assigned to partners later'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Existing Mode: Token Input */}
      {mode === 'existing' && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Enter Tokens</h2>
          <div>
            <label htmlFor="tokens" className="block text-sm font-medium text-gray-700 mb-2">
              Token Values (one per line or comma-separated)
            </label>
            <textarea
              id="tokens"
              rows={6}
              value={tokens}
              onChange={(e) => setTokens(e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm font-mono"
              placeholder="qr_abc123&#10;qr_def456&#10;qr_ghi789"
            />
            <p className="mt-2 text-sm text-gray-500">
              {tokenList.length} token(s) entered (max {MAX_TOKENS_PER_BATCH})
            </p>
          </div>
        </div>
      )}

      {/* Configuration */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Print Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              <option value="letter">US Letter (8.5&quot; × 11&quot;)</option>
              <option value="a4">A4 (8.27&quot; × 11.69&quot;)</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {/* Custom Dimensions */}
          {paperSize === 'custom' && (
            <>
              <div>
                <label htmlFor="customWidth" className="block text-sm font-medium text-gray-700 mb-2">
                  Width (inches)
                </label>
                <input
                  type="number"
                  id="customWidth"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(parseFloat(e.target.value) || 0)}
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
                  onChange={(e) => setCustomHeight(parseFloat(e.target.value) || 0)}
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
            <select
              id="sealDiameter"
              value={sealDiameter}
              onChange={(e) => setSealDiameter(parseFloat(e.target.value))}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              {SEAL_DIAMETER_PRESETS.map((size) => (
                <option key={size} value={size}>
                  {size}&quot; ({(size * 25.4).toFixed(0)}mm)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Generate</h2>
        <div className="flex gap-4">
          <button
            onClick={handleGenerateSvg}
            disabled={isGenerating || !isValid()}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : 'Download SVG Sheets'}
          </button>
          <button
            onClick={handleGeneratePdf}
            disabled={isGenerating || !isValid()}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : 'Download PDF'}
          </button>
        </div>
        
        {/* Summary */}
        <div className="mt-4 text-sm text-gray-600">
          {mode === 'generate' ? (
            <p>
              Will create <strong>{quantity}</strong> new TripDAR seal{quantity !== 1 ? 's' : ''}
              {selectedProductId && products.find(p => p.id === selectedProductId) && (
                <> linked to <strong>{products.find(p => p.id === selectedProductId)?.name}</strong></>
              )}
            </p>
          ) : (
            <p>
              Will generate seals for <strong>{tokenList.length}</strong> existing token{tokenList.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
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
                  Sheet ID: <code className="font-mono text-xs bg-green-100 px-1 py-0.5 rounded">{result.sheetId}</code>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
