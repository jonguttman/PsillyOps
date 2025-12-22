'use client';

import { useState } from 'react';
import { SEAL_DIAMETER_PRESETS, DEFAULT_SEAL_DIAMETER, MAX_TOKENS_PER_BATCH } from '@/lib/constants/seal';

type PaperSize = 'letter' | 'a4' | 'custom';

interface GenerationResult {
  success: boolean;
  message: string;
  pageCount?: number;
  sealsPerSheet?: number;
}

export function SealsClient() {
  const [tokens, setTokens] = useState<string>('');
  const [paperSize, setPaperSize] = useState<PaperSize>('letter');
  const [customWidth, setCustomWidth] = useState<number>(8.5);
  const [customHeight, setCustomHeight] = useState<number>(11);
  const [sealDiameter, setSealDiameter] = useState<number>(DEFAULT_SEAL_DIAMETER);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const tokenList = tokens
    .split(/[\n,]/)
    .map(t => t.trim())
    .filter(t => t.length > 0);

  const handleGeneratePdf = async () => {
    if (tokenList.length === 0) {
      setResult({ success: false, message: 'Please enter at least one token' });
      return;
    }

    if (tokenList.length > MAX_TOKENS_PER_BATCH) {
      setResult({ success: false, message: `Maximum ${MAX_TOKENS_PER_BATCH} tokens allowed per batch` });
      return;
    }

    setIsGenerating(true);
    setResult(null);

    try {
      const config = {
        paperSize,
        sealDiameter,
        marginIn: 0.25,
        ...(paperSize === 'custom' && {
          customWidth,
          customHeight,
        }),
      };

      const response = await fetch('/api/seals/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: tokenList, config }),
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

      setResult({
        success: true,
        message: `Successfully generated PDF with ${tokenList.length} seal(s)`,
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
    if (tokenList.length === 0) {
      setResult({ success: false, message: 'Please enter at least one token' });
      return;
    }

    if (tokenList.length > MAX_TOKENS_PER_BATCH) {
      setResult({ success: false, message: `Maximum ${MAX_TOKENS_PER_BATCH} tokens allowed per batch` });
      return;
    }

    setIsGenerating(true);
    setResult(null);

    try {
      const config = {
        paperSize,
        sealDiameter,
        marginIn: 0.25,
        ...(paperSize === 'custom' && {
          customWidth,
          customHeight,
        }),
      };

      const response = await fetch('/api/seals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: tokenList, config }),
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

      setResult({
        success: true,
        message: `Successfully generated ${data.pageCount} sheet(s) with ${tokenList.length} seal(s)`,
        pageCount: data.pageCount,
        sealsPerSheet: data.sealsPerSheet,
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
      {/* Token Input */}
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

      {/* Configuration */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Configuration</h2>
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
            disabled={isGenerating || tokenList.length === 0}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : 'Download SVG Sheets'}
          </button>
          <button
            onClick={handleGeneratePdf}
            disabled={isGenerating || tokenList.length === 0}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : 'Download PDF'}
          </button>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

