'use client';

import { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X } from 'lucide-react';

interface TemplateNameEditorProps {
  templateId: string;
  currentName: string;
  onRename: (formData: FormData) => Promise<void>;
}

export default function TemplateNameEditor({
  templateId,
  currentName,
  onRename
}: TemplateNameEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(currentName);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleEdit = () => {
    setIsEditing(true);
    setError(null);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setName(currentName);
    setError(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (name.trim() === currentName) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set('templateId', templateId);
      formData.set('name', name.trim());
      await onRename(formData);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          className="text-lg font-medium text-gray-900 border-b-2 border-blue-500 bg-transparent focus:outline-none px-0 py-0.5"
          style={{ width: `${Math.max(name.length, 10)}ch` }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="p-1 text-green-600 hover:text-green-700 hover:bg-green-50 rounded disabled:opacity-50"
          title="Save"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isSaving}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
          title="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
        {error && (
          <span className="text-xs text-red-600">{error}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <h3 className="text-lg font-medium text-gray-900">{currentName}</h3>
      <button
        type="button"
        onClick={handleEdit}
        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        title="Edit name"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}

