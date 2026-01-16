'use client';

import { useState, useRef, useCallback } from 'react';

interface FileUploadFieldProps {
  label: string;
  currentUrl?: string | null;
  accept: string;
  formatHint: string;
  maxSizeBytes: number;
  uploadEndpoint: string;
  onUploadComplete: (url: string) => void;
  onUrlChange: (url: string) => void;
  onClear: () => void;
  disabled?: boolean;
  showPreview?: boolean;
  previewType?: 'image' | 'pdf';
}

type Mode = 'url' | 'file';

export default function FileUploadField({
  label,
  currentUrl,
  accept,
  formatHint,
  maxSizeBytes,
  uploadEndpoint,
  onUploadComplete,
  onUrlChange,
  onClear,
  disabled = false,
  showPreview = true,
  previewType = 'image',
}: FileUploadFieldProps) {
  const [mode, setMode] = useState<Mode>('url');
  const [urlValue, setUrlValue] = useState(currentUrl || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    // Check file size
    if (file.size > maxSizeBytes) {
      const maxMB = maxSizeBytes / (1024 * 1024);
      return `File too large. Maximum: ${maxMB}MB`;
    }

    // Check file type via accept string
    const acceptedTypes = accept.split(',').map(t => t.trim());
    const fileType = file.type;
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();

    const isAccepted = acceptedTypes.some(accepted => {
      if (accepted.startsWith('.')) {
        return fileExt === accepted;
      }
      return fileType === accepted || accepted.endsWith('/*') && fileType.startsWith(accepted.replace('/*', '/'));
    });

    if (!isAccepted) {
      return `Invalid file type. ${formatHint}`;
    }

    return null;
  }, [accept, maxSizeBytes, formatHint]);

  const handleUpload = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(uploadEndpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Upload failed');
      }

      setUploadedFileName(file.name);
      onUploadComplete(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [uploadEndpoint, onUploadComplete, validateFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
  }, [handleUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  }, [disabled, isUploading]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled || isUploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleUpload(file);
    }
  }, [disabled, isUploading, handleUpload]);

  const handleUrlBlur = useCallback(() => {
    if (urlValue !== currentUrl) {
      onUrlChange(urlValue);
    }
  }, [urlValue, currentUrl, onUrlChange]);

  const handleClear = useCallback(() => {
    setUrlValue('');
    setUploadedFileName(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClear();
  }, [onClear]);

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">{label}</label>

      {/* Mode Toggle */}
      <div className="flex items-center space-x-4">
        <label className="inline-flex items-center cursor-pointer">
          <input
            type="radio"
            className="form-radio h-4 w-4 text-blue-600"
            checked={mode === 'url'}
            onChange={() => setMode('url')}
            disabled={disabled}
          />
          <span className="ml-2 text-sm text-gray-700">Enter URL</span>
        </label>
        <label className="inline-flex items-center cursor-pointer">
          <input
            type="radio"
            className="form-radio h-4 w-4 text-blue-600"
            checked={mode === 'file'}
            onChange={() => setMode('file')}
            disabled={disabled}
          />
          <span className="ml-2 text-sm text-gray-700">Upload File</span>
        </label>
      </div>

      {/* URL Input Mode */}
      {mode === 'url' && (
        <div>
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onBlur={handleUrlBlur}
            placeholder="https://example.com/file.jpg"
            disabled={disabled}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100"
          />
          <p className="mt-1 text-xs text-gray-500">
            Enter a direct URL to the file
          </p>
        </div>
      )}

      {/* File Upload Mode */}
      {mode === 'file' && (
        <div
          className={`
            relative border-2 border-dashed rounded-lg p-6 text-center transition-colors
            ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}
            ${disabled || isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400'}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            disabled={disabled || isUploading}
            className="sr-only"
          />

          {isUploading ? (
            <div className="flex flex-col items-center">
              <svg className="animate-spin h-8 w-8 text-blue-600 mb-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm text-gray-600">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {previewType === 'image' ? (
                <svg className="h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              <p className="text-sm text-gray-600">
                <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-500 mt-1">{formatHint}</p>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {/* Current File Preview */}
      {showPreview && currentUrl && (
        <div className="bg-gray-50 rounded-md p-4 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              {previewType === 'image' ? (
                <div className="flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentUrl}
                    alt="Preview"
                    className="h-16 w-16 object-cover rounded border"
                  />
                </div>
              ) : (
                <div className="flex-shrink-0 h-16 w-16 bg-red-100 rounded flex items-center justify-center">
                  <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {uploadedFileName || 'Current file'}
                </p>
                {previewType === 'pdf' && (
                  <a
                    href={currentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    View PDF
                  </a>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="text-gray-400 hover:text-red-500 disabled:opacity-50"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
