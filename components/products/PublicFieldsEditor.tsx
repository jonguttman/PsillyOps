'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import FileUploadField from '@/components/ui/FileUploadField';

interface PublicFieldsEditorProps {
  productId: string;
  currentDescription: string | null;
  currentImageUrl: string | null;
  onSaveDescription: (formData: FormData) => Promise<void>;
}

export default function PublicFieldsEditor({
  productId,
  currentDescription,
  currentImageUrl,
  onSaveDescription,
}: PublicFieldsEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [description, setDescription] = useState(currentDescription || '');
  const [imageUrl, setImageUrl] = useState(currentImageUrl || '');
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSaveDescription = async () => {
    setIsSaving(true);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append('id', productId);
    formData.append('publicDescription', description);
    formData.append('publicImageUrl', imageUrl);

    try {
      await onSaveDescription(formData);
      setSuccessMessage('Changes saved successfully');
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageUploadComplete = (url: string) => {
    setImageUrl(url);
    setSuccessMessage('Image uploaded successfully');
    startTransition(() => {
      router.refresh();
    });
  };

  const handleImageUrlChange = (url: string) => {
    setImageUrl(url);
  };

  const handleImageClear = async () => {
    // Call the DELETE endpoint
    try {
      const response = await fetch(`/api/products/${productId}/image`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setImageUrl('');
        setSuccessMessage('Image removed');
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (error) {
      console.error('Error removing image:', error);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-2">Public Verification Page</h2>
      <p className="text-sm text-gray-500 mb-4">
        These fields are displayed when customers scan the product QR code.
      </p>

      {successMessage && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">
          {successMessage}
        </div>
      )}

      <div className="space-y-6">
        {/* Product Image Upload */}
        <FileUploadField
          label="Product Image"
          currentUrl={imageUrl || null}
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          formatHint="JPG, PNG, or WebP (max 5MB)"
          maxSizeBytes={5 * 1024 * 1024}
          uploadEndpoint={`/api/products/${productId}/image`}
          onUploadComplete={handleImageUploadComplete}
          onUrlChange={handleImageUrlChange}
          onClear={handleImageClear}
          showPreview={true}
          previewType="image"
          disabled={isPending || isSaving}
        />

        {/* Public Description */}
        <div>
          <label htmlFor="publicDescription" className="block text-sm font-medium text-gray-700">
            Public Description
          </label>
          <textarea
            id="publicDescription"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter a description that customers will see when they scan the product QR code..."
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            disabled={isPending || isSaving}
          />
          <p className="mt-1 text-xs text-gray-500">
            This description will be shown on the public verification page.
          </p>
        </div>

        {/* Save Button */}
        <button
          type="button"
          onClick={handleSaveDescription}
          disabled={isPending || isSaving}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </>
          ) : (
            'Save Public Fields'
          )}
        </button>
      </div>
    </div>
  );
}
