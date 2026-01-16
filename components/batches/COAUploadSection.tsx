'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import FileUploadField from '@/components/ui/FileUploadField';

interface COAUploadSectionProps {
  batchId: string;
  currentUrl: string | null;
  uploadedAt: Date | null;
}

export default function COAUploadSection({
  batchId,
  currentUrl,
  uploadedAt,
}: COAUploadSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [coaUrl, setCoaUrl] = useState(currentUrl || '');
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUploadComplete = (url: string) => {
    setCoaUrl(url);
    setSuccessMessage('COA uploaded successfully');
    setErrorMessage(null);
    startTransition(() => {
      router.refresh();
    });
  };

  const handleUrlChange = async (url: string) => {
    setCoaUrl(url);

    // Save URL to database when changed
    if (url && url.trim()) {
      setIsSaving(true);
      setSuccessMessage(null);
      setErrorMessage(null);

      try {
        // Validate URL format
        new URL(url);

        const response = await fetch(`/api/batches/${batchId}/coa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        if (!response.ok) {
          // For URL mode, just keep the URL in state
          // The actual save happens when the user clicks save
        }
      } catch {
        // Invalid URL format, ignore for now
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleSaveUrl = async () => {
    if (!coaUrl.trim()) {
      setErrorMessage('Please enter a URL or upload a file');
      return;
    }

    // Validate URL format
    try {
      new URL(coaUrl);
    } catch {
      setErrorMessage('Invalid URL format');
      return;
    }

    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      // Use the existing server action pattern via form submission
      const formData = new FormData();
      formData.append('batchId', batchId);
      formData.append('coaUrl', coaUrl);

      const response = await fetch(`/api/batches/${batchId}`, {
        method: 'PATCH',
        body: formData,
      });

      if (response.ok) {
        setSuccessMessage('COA URL saved successfully');
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (error) {
      setErrorMessage('Failed to save COA URL');
      console.error('Error saving COA URL:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/batches/${batchId}/coa`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setCoaUrl('');
        setSuccessMessage('COA removed');
        startTransition(() => {
          router.refresh();
        });
      } else {
        setErrorMessage('Failed to remove COA');
      }
    } catch (error) {
      setErrorMessage('Failed to remove COA');
      console.error('Error removing COA:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-2">Certificate of Analysis</h2>
      <p className="text-sm text-gray-500 mb-4">
        Upload or link to the lab test results for this batch.
      </p>

      {successMessage && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {errorMessage}
        </div>
      )}

      <div className="space-y-4">
        <FileUploadField
          label="COA Document"
          currentUrl={coaUrl || null}
          accept="application/pdf,.pdf"
          formatHint="PDF only (max 10MB)"
          maxSizeBytes={10 * 1024 * 1024}
          uploadEndpoint={`/api/batches/${batchId}/coa`}
          onUploadComplete={handleUploadComplete}
          onUrlChange={handleUrlChange}
          onClear={handleClear}
          showPreview={true}
          previewType="pdf"
          disabled={isPending || isSaving}
        />

        {uploadedAt && coaUrl && (
          <p className="text-xs text-gray-500">
            Last updated: {new Date(uploadedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
          </p>
        )}

        <p className="text-xs text-gray-500">
          The COA will be displayed on the public batch verification page when customers scan the QR code.
        </p>
      </div>
    </div>
  );
}
