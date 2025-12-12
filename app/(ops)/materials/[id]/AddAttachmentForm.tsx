"use client";

import { useState } from "react";

interface AddAttachmentFormProps {
  materialId: string;
  addAction: (formData: FormData) => Promise<void>;
}

const FILE_TYPE_OPTIONS = [
  { value: "COA", label: "Certificate of Analysis (COA)" },
  { value: "MSDS", label: "Material Safety Data Sheet (MSDS)" },
  { value: "SPEC", label: "Specification Sheet" },
  { value: "OTHER", label: "Other" }
];

export function AddAttachmentForm({ materialId, addAction }: AddAttachmentFormProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
      >
        + Add Attachment
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Add Attachment</h3>
        <form
          action={async (formData) => {
            await addAction(formData);
            setIsOpen(false);
          }}
          className="space-y-4"
        >
          <input type="hidden" name="materialId" value={materialId} />
          
          <div>
            <label htmlFor="fileName" className="block text-sm font-medium text-gray-700">
              File Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="fileName"
              id="fileName"
              required
              placeholder="e.g., Lions_Mane_COA_2024.pdf"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="fileUrl" className="block text-sm font-medium text-gray-700">
              File URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              name="fileUrl"
              id="fileUrl"
              required
              placeholder="https://drive.google.com/..."
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Paste a link to Google Drive, Dropbox, S3, or any publicly accessible URL
            </p>
          </div>

          <div>
            <label htmlFor="fileType" className="block text-sm font-medium text-gray-700">
              Document Type
            </label>
            <select
              name="fileType"
              id="fileType"
              defaultValue="OTHER"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              {FILE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Add Attachment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

