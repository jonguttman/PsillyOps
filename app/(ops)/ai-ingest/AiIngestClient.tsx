'use client';

import { useState, useCallback } from 'react';

interface DocumentImport {
  id: string;
  sourceType: string;
  originalName: string | null;
  status: string;
  confidence: number | null;
  createdAt: string | Date;
  appliedAt: string | Date | null;
  error: string | null;
  commandCount: number;
  user?: { id: string; name: string } | null;
}

interface DocumentDetail {
  id: string;
  sourceType: string;
  originalName: string | null;
  textPreview: string | null;
  status: string;
  confidence: number | null;
  documentType: string | null;
  commands: {
    index: number;
    command: string;
    args: Record<string, any>;
    summary: string;
  }[];
  notes: string | null;
  error: string | null;
  createdAt: string;
  appliedAt: string | null;
  rawAiResult: any;
}

interface AiIngestClientProps {
  initialImports: DocumentImport[];
  totalCount: number;
  canIngest: boolean;
}

export default function AiIngestClient({ initialImports, totalCount, canIngest }: AiIngestClientProps) {
  const [imports, setImports] = useState<DocumentImport[]>(initialImports);
  const [pasteText, setPasteText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImport, setSelectedImport] = useState<DocumentDetail | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Handle paste submission
  const handleSubmitPaste = useCallback(async () => {
    if (!pasteText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText, sourceType: 'PASTE' }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to process document');
      }

      // Refresh the list
      await refreshImports();
      setPasteText('');

      // Open the newly created import
      if (data.import?.id) {
        await openImportDetail(data.import.id);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }, [pasteText, isSubmitting]);

  // Refresh imports list
  const refreshImports = async () => {
    try {
      const response = await fetch('/api/ai/ingest?limit=20');
      const data = await response.json();
      if (response.ok) {
        setImports(data.items);
      }
    } catch (err) {
      console.error('Failed to refresh imports:', err);
    }
  };

  // Open import detail
  const openImportDetail = async (id: string) => {
    try {
      const response = await fetch(`/api/ai/ingest/${id}`);
      const data = await response.json();
      if (response.ok) {
        setSelectedImport(data);
        setApplyResult(null);
      } else {
        throw new Error(data.message || 'Failed to load import');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load import details');
    }
  };

  // Apply import
  const handleApply = async () => {
    if (!selectedImport || isApplying) return;

    setIsApplying(true);
    setApplyResult(null);

    try {
      const response = await fetch(`/api/ai/ingest/${selectedImport.id}/apply`, {
        method: 'POST',
      });

      const data = await response.json();
      setApplyResult(data);

      // Refresh the list
      await refreshImports();

      // Update selected import status
      if (response.ok) {
        setSelectedImport(prev => prev ? { ...prev, status: 'APPLIED' } : null);
      }
    } catch (err: any) {
      setApplyResult({ success: false, message: err.message || 'Failed to apply' });
    } finally {
      setIsApplying(false);
    }
  };

  // Reject import
  const handleReject = async (reason?: string) => {
    if (!selectedImport) return;

    try {
      const response = await fetch(`/api/ai/ingest/${selectedImport.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });

      if (response.ok) {
        await refreshImports();
        setSelectedImport(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to reject');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPLIED': return 'bg-green-100 text-green-800';
      case 'REJECTED': return 'bg-red-100 text-red-800';
      case 'FAILED': return 'bg-red-100 text-red-800';
      case 'PENDING_REVIEW': return 'bg-yellow-100 text-yellow-800';
      case 'PARSED': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left Column: Input and List */}
      <div className="space-y-6">
        {/* Paste Input */}
        {canIngest && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Paste Document Text</h2>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste invoice, receipt, order form, or batch sheet text here..."
              className="w-full h-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              disabled={isSubmitting}
            />
            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSubmitPaste}
                disabled={!pasteText.trim() || isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Processing...' : 'Analyze Document'}
              </button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-sm text-red-600 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Imports List */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Recent Imports</h2>
            <p className="text-sm text-gray-500">{totalCount} total imports</p>
          </div>
          
          {imports.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No document imports yet. Paste a document above to get started.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {imports.map((imp) => (
                <div
                  key={imp.id}
                  onClick={() => openImportDetail(imp.id)}
                  className={`px-6 py-4 hover:bg-gray-50 cursor-pointer ${
                    selectedImport?.id === imp.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(imp.status)}`}>
                          {imp.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          {imp.sourceType}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-900">
                        {imp.originalName || `Import ${imp.id.slice(-6)}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        {imp.commandCount} command(s) · {new Date(imp.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {imp.confidence !== null && (
                      <div className="text-right">
                        <span className="text-xs text-gray-500">Confidence</span>
                        <p className="text-sm font-medium text-gray-900">
                          {Math.round(imp.confidence * 100)}%
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Detail View */}
      <div className="bg-white rounded-lg shadow">
        {selectedImport ? (
          <div>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900">Import Details</h2>
                <button
                  onClick={() => setSelectedImport(null)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(selectedImport.status)}`}>
                  {selectedImport.status}
                </span>
                {selectedImport.confidence !== null && (
                  <span className="text-xs text-gray-500">
                    {Math.round(selectedImport.confidence * 100)}% confidence
                  </span>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-4 space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto">
              {/* Text Preview */}
              {selectedImport.textPreview && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Document Preview</h3>
                  <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600 whitespace-pre-wrap font-mono">
                    {selectedImport.textPreview}
                  </div>
                </div>
              )}

              {/* Commands */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Parsed Commands ({selectedImport.commands.length})
                </h3>
                {selectedImport.commands.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No commands parsed from this document</p>
                ) : (
                  <div className="space-y-2">
                    {selectedImport.commands.map((cmd, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                            {cmd.command}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-700">{cmd.summary}</p>
                        <details className="mt-2">
                          <summary className="text-xs text-gray-500 cursor-pointer">View arguments</summary>
                          <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-auto">
                            {JSON.stringify(cmd.args, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              {selectedImport.notes && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">AI Notes</h3>
                  <p className="text-sm text-gray-600">{selectedImport.notes}</p>
                </div>
              )}

              {/* Error */}
              {selectedImport.error && (
                <div className="p-3 bg-red-50 rounded-lg">
                  <h3 className="text-sm font-medium text-red-700 mb-1">Error</h3>
                  <p className="text-sm text-red-600">{selectedImport.error}</p>
                </div>
              )}

              {/* Apply Result */}
              {applyResult && (
                <div className={`p-4 rounded-lg ${applyResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
                  <h3 className={`text-sm font-medium mb-2 ${applyResult.success ? 'text-green-700' : 'text-red-700'}`}>
                    {applyResult.success ? 'Applied Successfully' : 'Apply Failed'}
                  </h3>
                  <p className={`text-sm ${applyResult.success ? 'text-green-600' : 'text-red-600'}`}>
                    {applyResult.message}
                  </p>
                  {applyResult.results && (
                    <div className="mt-2 space-y-1">
                      {applyResult.results.map((r: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          {r.success ? (
                            <span className="text-green-600">✓</span>
                          ) : (
                            <span className="text-red-600">✗</span>
                          )}
                          <span className={r.success ? 'text-green-600' : 'text-red-600'}>
                            {r.command}: {r.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Raw JSON */}
              <details>
                <summary className="text-xs text-gray-500 cursor-pointer">View raw AI result</summary>
                <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-xs overflow-auto max-h-60">
                  {JSON.stringify(selectedImport.rawAiResult, null, 2)}
                </pre>
              </details>
            </div>

            {/* Actions */}
            {canIngest && selectedImport.status !== 'APPLIED' && selectedImport.status !== 'REJECTED' && (
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => handleReject('Manually rejected')}
                  className="px-4 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100"
                >
                  Reject
                </button>
                <button
                  onClick={handleApply}
                  disabled={isApplying || selectedImport.commands.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isApplying ? 'Applying...' : 'Approve & Apply'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="px-6 py-16 text-center text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-4">Select an import to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}
