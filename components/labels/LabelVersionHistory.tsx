'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LabelPreviewButton from '@/components/labels/LabelPreviewButton';
import type { PlaceableElement } from '@/lib/types/placement';

interface LabelVersion {
  id: string;
  version: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string | Date;
  elements?: unknown; // JSON value from Prisma, cast at usage
  fileUrl?: string;
}

interface LabelVersionHistoryProps {
  templateId: string;
  templateEntityType: string;
  versions: LabelVersion[];
  canManage: boolean;
  onActivate: (formData: FormData) => void;
  onDeactivate: (formData: FormData) => void;
}

export default function LabelVersionHistory({
  templateId,
  templateEntityType,
  versions,
  canManage,
  onActivate,
  onDeactivate
}: LabelVersionHistoryProps) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const activeVersions = versions.filter(v => v.isActive);
  const archivedVersions = versions.filter(v => !v.isActive);

  const formatDateTime = (date: string | Date) => {
    return new Date(date).toLocaleString();
  };

  const handleDelete = async (versionId: string) => {
    if (!confirm('Permanently delete this label version? This cannot be undone.')) return;

    setIsDeleting(versionId);
    try {
      const res = await fetch(`/api/labels/templates/${templateId}/versions`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        alert(errorText || 'Failed to delete version');
        return;
      }

      router.refresh();
    } catch (error) {
      console.error('Failed to delete version', error);
      alert('Failed to delete version');
    } finally {
      setIsDeleting(null);
    }
  };

  const renderVersionRow = (version: LabelVersion) => (
    <tr key={version.id} className={version.isActive ? 'bg-green-50' : 'opacity-60 hover:opacity-100 transition-opacity'}>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="text-sm font-medium text-gray-900">v{version.version}</span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {version.isActive ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            Inactive
          </span>
        )}
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-gray-500">{version.notes || '-'}</span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {formatDateTime(version.createdAt)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex justify-end gap-2 items-center">
          <LabelPreviewButton 
            versionId={version.id} 
            entityType={templateEntityType}
            initialElements={(version.elements as PlaceableElement[] | null) || []}
          />
          {canManage && (
            <>
              {version.isActive ? (
                <form action={onDeactivate} className="inline">
                  <input type="hidden" name="versionId" value={version.id} />
                  <button
                    type="submit"
                    className="text-yellow-600 hover:text-yellow-900 ml-2"
                  >
                    Deactivate
                  </button>
                </form>
              ) : (
                <>
                  <form action={onActivate} className="inline">
                    <input type="hidden" name="versionId" value={version.id} />
                    <button
                      type="submit"
                      className="text-green-600 hover:text-green-900 ml-2"
                    >
                      Activate
                    </button>
                  </form>
                  <button
                    onClick={() => handleDelete(version.id)}
                    disabled={isDeleting === version.id}
                    className="text-red-600 hover:text-red-900 ml-3 disabled:opacity-50"
                  >
                    {isDeleting === version.id ? 'Deleting...' : 'Delete'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );

  if (versions.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-gray-500">
        <p>No versions uploaded yet</p>
        {canManage && (
          <p className="text-sm mt-1">Upload an SVG file to create the first version</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Version
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Notes
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Created
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {/* Active Versions */}
          {activeVersions.map(renderVersionRow)}

          {/* Archived Versions Header */}
          {archivedVersions.length > 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-2 bg-gray-50 border-t border-b border-gray-100">
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className="flex items-center text-xs font-medium text-gray-500 hover:text-gray-700 focus:outline-none w-full text-left"
                >
                  <svg 
                    className={`w-3 h-3 mr-1 transition-transform ${showArchived ? 'rotate-90' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  {showArchived ? 'Hide' : 'Show'} Archived Versions ({archivedVersions.length})
                </button>
              </td>
            </tr>
          )}

          {/* Archived Versions */}
          {showArchived && archivedVersions.map(renderVersionRow)}
        </tbody>
      </table>
    </div>
  );
}
