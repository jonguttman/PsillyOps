'use client';

import { useState, useEffect, useRef } from 'react';

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

interface PrintLabelButtonProps {
  entityType: 'PRODUCT' | 'BATCH' | 'INVENTORY';
  entityId: string;
  entityCode: string;  // SKU, batch code, or lot number
  buttonText?: string;
  className?: string;
}

export default function PrintLabelButton({
  entityType,
  entityId,
  entityCode,
  buttonText = 'Print Labels',
  className = ''
}: PrintLabelButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [quantity, setQuantity] = useState(1);
  const [sheetSvgs, setSheetSvgs] = useState<string[]>([]);
  const [sheetMeta, setSheetMeta] = useState<{
    perSheet: number;
    columns: number;
    rows: number;
    rotationUsed: boolean;
    totalSheets: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const printContainerRef = useRef<HTMLDivElement>(null);

  const getPreviewSvg = (sheetSvg: string) => {
    // Screen preview should be responsive; printing/download must keep exact physical sizing.
    // We do this by adding CSS sizing + preserveAspectRatio on the outer <svg> only.
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

  // Fetch available templates when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

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

      // Auto-select active version if available
      const activeVersion = data.templates
        ?.flatMap((t: LabelTemplate) => t.versions)
        ?.find((v: LabelVersion) => v.isActive);
      
      if (activeVersion) {
        setSelectedVersionId(activeVersion.id);
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

    setIsRendering(true);
    setError(null);
    setSheetSvgs([]);
    setSheetMeta(null);

    try {
      const response = await fetch('/api/labels/render-letter-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId: selectedVersionId,
          entityType,
          entityId,
          quantity
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to render label');
      }

      setSheetSvgs(Array.isArray(data.sheets) ? data.sheets : []);
      setSheetMeta({
        perSheet: data.perSheet ?? 0,
        columns: data.columns ?? 0,
        rows: data.rows ?? 0,
        rotationUsed: !!data.rotationUsed,
        totalSheets: data.totalSheets ?? 0
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to render label');
    } finally {
      setIsRendering(false);
    }
  };

  const handlePrint = () => {
    if (!sheetSvgs.length || !printContainerRef.current) return;

    // Create a new window for printing
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

  const handleDownload = () => {
    if (!sheetSvgs.length) return;
    const safe = entityCode.replace(/[^a-z0-9]/gi, '_');

    if (sheetSvgs.length === 1) {
      const blob = new Blob([sheetSvgs[0]], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `label-sheet-${safe}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Label Sheets - ${safe}</title>
    <style>
      @page { size: letter; margin: 0; }
      body { margin: 0; padding: 0; }
      .sheet { page-break-after: always; }
      svg { width: 8.5in; height: 11in; }
    </style>
  </head>
  <body>
    ${sheetSvgs.map(svg => `<div class="sheet">${svg}</div>`).join('')}
  </body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `label-sheets-${safe}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
      <button
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 ${className}`}
      >
        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        {buttonText}
      </button>

      {/* Print Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => setIsOpen(false)}
            />

            {/* Modal Panel */}
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
                      <div>
                        <label htmlFor="version" className="block text-sm font-medium text-gray-700">
                          Label Version
                        </label>
                        <select
                          id="version"
                          value={selectedVersionId}
                          onChange={(e) => {
                            setSelectedVersionId(e.target.value);
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

                      <div>
                        <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">
                          Quantity
                        </label>
                        <input
                          type="number"
                          id="quantity"
                          min="1"
                          max="100"
                          value={quantity}
                          onChange={(e) => setQuantity(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500">Max 100 labels per print</p>
                      </div>

                      <button
                        onClick={handleRender}
                        disabled={!selectedVersionId || isRendering}
                        className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                          <div>Layout: {sheetMeta.columns}×{sheetMeta.rows} ({sheetMeta.perSheet}/sheet)</div>
                          <div>Rotation: {sheetMeta.rotationUsed ? '90°' : 'none'}</div>
                          <div>Sheets: {sheetSvgs.length}</div>
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
                      onClick={handlePrint}
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                    >
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      Print ({quantity})
                    </button>
                    <button
                      onClick={handleDownload}
                      className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                    >
                      <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download {sheetSvgs.length === 1 ? 'SVG' : 'HTML'}
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
    </>
  );
}

