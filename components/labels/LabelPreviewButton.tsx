'use client';

import { useState } from 'react';

interface LabelPreviewButtonProps {
  versionId: string;
  entityType: string;
}

export default function LabelPreviewButton({ versionId, entityType }: LabelPreviewButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = async () => {
    setIsOpen(true);
    setIsLoading(true);
    setError(null);

    try {
      // For preview, we'll use a dummy entity ID
      // In a real scenario, this would show the template without QR injection
      // For now, we'll show a message about needing an entity to preview
      
      // Try to get a sample entity to preview with
      const response = await fetch(`/api/labels/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId,
          entityType,
          entityId: 'preview-sample' // This will fail, but we handle it gracefully
        })
      });

      if (!response.ok) {
        // Expected for preview - show placeholder message
        setSvgContent(null);
        setError('Preview requires an actual entity. Use the Print Labels button on a specific batch, product, or inventory item to see the rendered label with QR code.');
      } else {
        const data = await response.json();
        setSvgContent(data.svg);
      }
    } catch (err) {
      setError('Unable to load preview');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handlePreview}
        className="text-blue-600 hover:text-blue-900"
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
            <div className="relative inline-block bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:w-full sm:max-w-2xl">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Label Preview
                  </h3>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="border rounded-lg p-4 bg-gray-50 min-h-64 flex items-center justify-center">
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
                      <svg className="h-12 w-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm">{error}</p>
                    </div>
                  ) : svgContent ? (
                    <div 
                      className="w-full"
                      dangerouslySetInnerHTML={{ __html: svgContent }}
                    />
                  ) : (
                    <div className="text-center text-gray-500">
                      <p>No preview available</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
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

