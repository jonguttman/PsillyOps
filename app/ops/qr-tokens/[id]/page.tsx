// QR Token Detail Page
// Admin-only page for viewing token details, scan history, and adding annotations

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { redirect, notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { getToken } from '@/lib/services/qrTokenService';
import { findActiveRedirectRule } from '@/lib/services/qrRedirectService';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity } from '@prisma/client';

async function addNote(formData: FormData) {
  'use server';
  
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }
  
  const tokenId = formData.get('tokenId') as string;
  const note = formData.get('note') as string;
  
  if (!note?.trim()) {
    throw new Error('Note cannot be empty');
  }

  const token = await prisma.qRToken.findUnique({
    where: { id: tokenId },
    select: { entityType: true, entityId: true }
  });

  if (!token) {
    throw new Error('Token not found');
  }

  // Log the note as an activity
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: tokenId,
    action: 'qr_token_note_added',
    userId: session.user.id,
    summary: `Note added to QR token: ${note.substring(0, 50)}${note.length > 50 ? '...' : ''}`,
    details: {
      tokenId,
      entityType: token.entityType,
      entityId: token.entityId,
      note
    },
    tags: ['qr', 'note', 'annotation']
  });

  revalidatePath(`/qr-tokens/${tokenId}`);
}

export default async function QRTokenDetailPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  if (session.user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const { id } = await params;
  const token = await getToken(id);

  if (!token) {
    notFound();
  }

  // Get scan history from activity logs
  // We search by entityId matching the token's associated entity and filter by tokenId in details
  const scanHistory = await prisma.activityLog.findMany({
    where: {
      entityId: token.entityId,
      action: { contains: 'qr_token_scanned' }
    },
    orderBy: { createdAt: 'desc' },
    take: 100 // Fetch more and filter in memory
  });

  // Filter to only scans for this specific token
  const filteredScanHistory = scanHistory.filter((scan) => {
    const details = scan.details as any;
    return details?.tokenId === token.id;
  }).slice(0, 50);

  // Get token notes
  const notes = await prisma.activityLog.findMany({
    where: {
      entityId: token.id,
      action: 'qr_token_note_added'
    },
    include: {
      user: {
        select: { id: true, name: true, email: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Determine current resolved redirect
  let currentRedirect: {
    type: 'TOKEN' | 'GROUP' | 'DEFAULT';
    url: string;
    ruleId?: string;
  } | null = null;

  if (token.status === 'ACTIVE') {
    if (token.redirectUrl) {
      currentRedirect = {
        type: 'TOKEN',
        url: token.redirectUrl
      };
    } else {
      const rule = await findActiveRedirectRule({
        entityType: token.entityType,
        entityId: token.entityId,
        versionId: token.versionId || undefined
      });

      if (rule) {
        currentRedirect = {
          type: 'GROUP',
          url: rule.redirectUrl,
          ruleId: rule.id
        };
      } else {
        // Default routing
        const defaultUrl = getDefaultRedirectPath(token.entityType, token.entityId);
        currentRedirect = {
          type: 'DEFAULT',
          url: defaultUrl
        };
      }
    }
  }

  // Get entity name for display
  let entityName = token.entityId;
  if (token.entityType === 'PRODUCT') {
    const product = await prisma.product.findUnique({
      where: { id: token.entityId },
      select: { name: true, sku: true }
    });
    if (product) entityName = `${product.name} (${product.sku})`;
  } else if (token.entityType === 'BATCH') {
    const batch = await prisma.batch.findUnique({
      where: { id: token.entityId },
      select: { batchCode: true }
    });
    if (batch) entityName = batch.batchCode;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QR Token Details</h1>
          <p className="mt-1 text-sm text-gray-600 font-mono">
            {token.token}
          </p>
        </div>
        <Link
          href="/qr-redirects"
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          ← Back to Redirect Rules
        </Link>
      </div>

      {/* Token Metadata */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Token Information</h2>
        <dl className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <dt className="text-sm font-medium text-gray-500">Entity Type</dt>
            <dd className="mt-1 text-sm text-gray-900">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                {token.entityType}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Entity</dt>
            <dd className="mt-1 text-sm text-gray-900">
              <Link 
                href={getEntityLink(token.entityType, token.entityId)}
                className="text-blue-600 hover:text-blue-800"
              >
                {entityName}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Label Version</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {token.version ? (
                <span>{token.version.template.name} v{token.version.version}</span>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Status</dt>
            <dd className="mt-1">
              {token.status === 'ACTIVE' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
              ) : token.status === 'REVOKED' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                  Revoked
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                  Expired
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Printed At</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {new Date(token.printedAt).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Total Scans</dt>
            <dd className="mt-1 text-sm text-gray-900 font-semibold">
              {token.scanCount}
            </dd>
          </div>
          {token.lastScannedAt && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Last Scanned</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(token.lastScannedAt).toLocaleString()}
              </dd>
            </div>
          )}
          {token.expiresAt && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Expires At</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(token.expiresAt).toLocaleString()}
              </dd>
            </div>
          )}
          {token.revokedReason && (
            <div className="col-span-full">
              <dt className="text-sm font-medium text-gray-500">Revoked Reason</dt>
              <dd className="mt-1 text-sm text-red-600">
                {token.revokedReason}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Current Redirect Resolution */}
      {currentRedirect && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Current Redirect Resolution</h2>
          <div className="flex items-center space-x-4">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              currentRedirect.type === 'TOKEN' ? 'bg-blue-100 text-blue-800' :
              currentRedirect.type === 'GROUP' ? 'bg-purple-100 text-purple-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {currentRedirect.type}
            </span>
            <span className="text-sm text-gray-600">→</span>
            <a 
              href={currentRedirect.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-800 truncate"
            >
              {currentRedirect.url}
            </a>
            {currentRedirect.ruleId && (
              <Link
                href={`/qr-redirects?highlight=${currentRedirect.ruleId}`}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                (View Rule)
              </Link>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {currentRedirect.type === 'TOKEN' && 'This token has a specific redirect URL set.'}
            {currentRedirect.type === 'GROUP' && 'Redirected by an active group rule.'}
            {currentRedirect.type === 'DEFAULT' && 'Using default entity routing.'}
          </p>
        </div>
      )}

      {/* Scan History */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Scan History
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({filteredScanHistory.length} records)
          </span>
        </h2>
        {filteredScanHistory.length === 0 ? (
          <p className="text-sm text-gray-500">No scan history recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Resolution Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Destination
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredScanHistory.map((scan) => {
                  const details = scan.details as any;
                  return (
                    <tr key={scan.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {new Date(scan.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          details?.resolutionType === 'TOKEN' ? 'bg-blue-100 text-blue-800' :
                          details?.resolutionType === 'GROUP' ? 'bg-purple-100 text-purple-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {details?.resolutionType || 'DEFAULT'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 truncate max-w-xs">
                        {details?.redirectUrl || details?.destination || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notes / Annotations */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Notes
          <span className="ml-2 text-sm font-normal text-gray-500">
            (Admin only, append-only)
          </span>
        </h2>

        {/* Add Note Form */}
        <form action={addNote} className="mb-6">
          <input type="hidden" name="tokenId" value={token.id} />
          <div className="flex gap-3">
            <input
              type="text"
              name="note"
              required
              placeholder="Add a note about this token..."
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
            <button
              type="submit"
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              Add Note
            </button>
          </div>
        </form>

        {/* Notes List */}
        {notes.length === 0 ? (
          <p className="text-sm text-gray-500">No notes yet.</p>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => {
              const details = note.details as any;
              return (
                <div key={note.id} className="border-l-4 border-blue-200 pl-4 py-2">
                  <p className="text-sm text-gray-900">{details?.note || note.summary}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {note.user?.name || 'System'} • {new Date(note.createdAt).toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function getDefaultRedirectPath(entityType: string, entityId: string): string {
  switch (entityType) {
    case 'PRODUCT':
      return `/qr/product/${entityId}`;
    case 'BATCH':
      return `/qr/batch/${entityId}`;
    case 'INVENTORY':
      return `/qr/inventory/${entityId}`;
    default:
      return '/';
  }
}

function getEntityLink(entityType: string, entityId: string): string {
  switch (entityType) {
    case 'PRODUCT':
      return `/products/${entityId}`;
    case 'BATCH':
      return `/batches/${entityId}`;
    case 'INVENTORY':
      return `/inventory/${entityId}`;
    default:
      return '#';
  }
}

