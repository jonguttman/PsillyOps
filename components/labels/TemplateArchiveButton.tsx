'use client';

import { useState } from 'react';
import { Archive } from 'lucide-react';

interface TemplateArchiveButtonProps {
  templateId: string;
  templateName: string;
  onArchive: (formData: FormData) => Promise<void>;
}

export default function TemplateArchiveButton({
  templateId,
  templateName,
  onArchive
}: TemplateArchiveButtonProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setIsConfirming(true);
    setError(null);
  };

  const handleCancel = () => {
    setIsConfirming(false);
    setError(null);
  };

  const handleConfirm = async () => {
    setIsArchiving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set('templateId', templateId);
      await onArchive(formData);
      // Page will revalidate and template will disappear
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive');
      setIsArchiving(false);
      setIsConfirming(false);
    }
  };

  if (isConfirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Archive &quot;{templateName}&quot;?</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isArchiving}
          className="px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50"
        >
          {isArchiving ? 'Archiving...' : 'Yes, Archive'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isArchiving}
          className="px-2 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
        >
          Cancel
        </button>
        {error && (
          <span className="text-xs text-red-600">{error}</span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
      title="Archive this template (only available when no versions are active)"
    >
      <Archive className="h-4 w-4" />
      <span>Archive</span>
    </button>
  );
}

