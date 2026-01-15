import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { formatDateTime } from '@/lib/utils/formatters';
import { createTemplate, activateVersion, deactivateVersion, updateTemplate, archiveTemplate } from '@/lib/services/labelService';
import { LabelEntityType } from '@prisma/client';
import LabelUploadForm from '@/components/labels/LabelUploadForm';
import LabelVersionHistory from '@/components/labels/LabelVersionHistory';
import TemplateNameEditor from '@/components/labels/TemplateNameEditor';
import TemplateArchiveButton from '@/components/labels/TemplateArchiveButton';

const ENTITY_TYPE_LABELS: Record<string, string> = {
  PRODUCT: 'Product Labels',
  BATCH: 'Batch Labels',
  INVENTORY: 'Inventory Labels',
  CUSTOM: 'Custom Labels'
};

const ENTITY_TYPE_COLORS: Record<string, string> = {
  PRODUCT: 'bg-blue-100 text-blue-800',
  BATCH: 'bg-green-100 text-green-800',
  INVENTORY: 'bg-purple-100 text-purple-800',
  CUSTOM: 'bg-gray-100 text-gray-800'
};

async function handleCreateTemplate(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');

  const name = formData.get('name') as string;
  const entityType = formData.get('entityType') as LabelEntityType;

  await createTemplate({
    name,
    entityType,
    userId: session.user.id
  });

  revalidatePath('/ops/labels');
}

async function handleActivateVersion(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');

  const versionId = formData.get('versionId') as string;
  await activateVersion(versionId, session.user.id);
  revalidatePath('/ops/labels');
}

async function handleDeactivateVersion(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');

  const versionId = formData.get('versionId') as string;
  await deactivateVersion(versionId, session.user.id);
  revalidatePath('/ops/labels');
}

async function handleRenameTemplate(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');

  const templateId = formData.get('templateId') as string;
  const name = formData.get('name') as string;

  await updateTemplate(templateId, name, session.user.id);
  revalidatePath('/ops/labels');
}

async function handleArchiveTemplate(formData: FormData) {
  'use server';
  const session = await auth();
  if (!session) throw new Error('Not authenticated');

  const templateId = formData.get('templateId') as string;

  await archiveTemplate(templateId, session.user.id);
  revalidatePath('/ops/labels');
}

export default async function LabelsPage() {
  const session = await auth();
  if (!session || !session.user) redirect('/login');
  if (session.user.role === 'REP') redirect('/');

  const templates = await prisma.labelTemplate.findMany({
    include: {
      versions: {
        orderBy: { createdAt: 'desc' }
      }
    },
    orderBy: [
      { entityType: 'asc' },
      { name: 'asc' }
    ]
  });

  // Group templates by entity type
  const templatesByType = templates.reduce((acc, template) => {
    const type = template.entityType;
    if (!acc[type]) acc[type] = [];
    acc[type].push(template);
    return acc;
  }, {} as Record<string, typeof templates>);

  const canManage = session.user.role === 'ADMIN' || session.user.role === 'WAREHOUSE';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Label Templates</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage label templates and versions for printing
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">SVG Label Guidelines</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>Labels should be SVG files. For optimal QR placement, include a <code className="bg-blue-100 px-1 rounded">&lt;g id=&quot;qr-placeholder&quot;&gt;&lt;/g&gt;</code> element. If missing, a QR placeholder will be auto-generated in the bottom-right corner.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create Template Form */}
      {canManage && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Create New Template</h2>
          <form action={handleCreateTemplate} className="flex gap-4 items-end">
            <div className="flex-1">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Template Name
              </label>
              <input
                type="text"
                name="name"
                id="name"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="e.g., Product Label 2x3"
              />
            </div>
            <div className="w-48">
              <label htmlFor="entityType" className="block text-sm font-medium text-gray-700">
                Entity Type
              </label>
              <select
                name="entityType"
                id="entityType"
                required
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="PRODUCT">Product</option>
                <option value="BATCH">Batch</option>
                <option value="INVENTORY">Inventory</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Create Template
            </button>
          </form>
        </div>
      )}

      {/* Templates by Type */}
      {Object.entries(ENTITY_TYPE_LABELS).map(([type, label]) => {
        const typeTemplates = templatesByType[type] || [];
        if (typeTemplates.length === 0) return null;

        return (
          <div key={type} className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ENTITY_TYPE_COLORS[type]}`}>
                {type}
              </span>
              {label}
            </h2>

            {typeTemplates.map((template) => {
              const hasActiveVersion = template.versions.some(v => v.isActive);
              const canArchive = canManage && !hasActiveVersion;

              return (
                <div key={template.id} className="bg-white shadow rounded-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <div className="flex justify-between items-center">
                      <div>
                        {canManage ? (
                          <TemplateNameEditor
                            templateId={template.id}
                            currentName={template.name}
                            onRename={handleRenameTemplate}
                          />
                        ) : (
                          <h3 className="text-lg font-medium text-gray-900">{template.name}</h3>
                        )}
                        <p className="text-sm text-gray-500">
                          Created {formatDateTime(template.createdAt)} • {template.versions.length} version(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {canArchive && (
                          <TemplateArchiveButton
                            templateId={template.id}
                            templateName={template.name}
                            onArchive={handleArchiveTemplate}
                          />
                        )}
                        {canManage && (
                          <LabelUploadForm templateId={template.id} templateName={template.name} />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Versions Table */}
                  <LabelVersionHistory
                    templateId={template.id}
                    templateEntityType={template.entityType}
                    versions={template.versions.map(v => ({
                      ...v,
                      createdAt: v.createdAt.toISOString(),
                      updatedAt: v.updatedAt ? v.updatedAt.toISOString() : null
                    }))}
                    canManage={canManage}
                    onActivate={handleActivateVersion}
                    onDeactivate={handleDeactivateVersion}
                  />
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Empty State */}
      {templates.length === 0 && (
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No label templates</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating a new label template above.
          </p>
        </div>
      )}
    </div>
  );
}
