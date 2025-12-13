// QR Token Detail Page - Phase 3 Operational UX
// Provides comprehensive view of a QR token with scan history, redirect controls, and annotations

import { auth } from '@/lib/auth/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getQRDetail, getQRScanHistory, getQRNotes, buildTokenUrl, getBaseUrl } from '@/lib/services/qrTokenService';
import { revalidatePath } from 'next/cache';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

// Server Actions
async function addNote(formData: FormData) {
  'use server';
  
  const session = await auth();
  if (!session) throw new Error('Unauthorized');
  
  const tokenId = formData.get('tokenId') as string;
  const message = formData.get('message') as string;
  
  if (!message?.trim()) return;
  
  const { addQRNote } = await import('@/lib/services/qrTokenService');
  await addQRNote(tokenId, message.trim(), session.user.id);
  
  revalidatePath(`/qr/${tokenId}`);
}

async function setRedirectOverride(formData: FormData) {
  'use server';
  
  const session = await auth();
  if (!session || !['ADMIN', 'PRODUCTION'].includes(session.user.role)) {
    throw new Error('Unauthorized');
  }
  
  const tokenId = formData.get('tokenId') as string;
  const redirectUrl = formData.get('redirectUrl') as string;
  
  const token = await prisma.qRToken.findUnique({ where: { id: tokenId } });
  if (!token) throw new Error('Token not found');
  
  const previousUrl = token.redirectUrl;
  
  await prisma.qRToken.update({
    where: { id: tokenId },
    data: { redirectUrl: redirectUrl || null }
  });
  
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: token.entityId,
    action: redirectUrl ? 'qr_token_override_set' : 'qr_token_override_cleared',
    userId: session.user.id,
    summary: redirectUrl 
      ? `Set redirect override on token ${token.token.slice(0, 10)}... to ${redirectUrl}`
      : `Cleared redirect override from token ${token.token.slice(0, 10)}...`,
    before: { redirectUrl: previousUrl },
    after: { redirectUrl: redirectUrl || null },
    details: { tokenId, tokenValue: token.token },
    tags: ['qr', 'token', 'override']
  });
  
  revalidatePath(`/qr/${tokenId}`);
}

async function revokeToken(formData: FormData) {
  'use server';
  
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized - Admin only');
  }
  
  const tokenId = formData.get('tokenId') as string;
  const reason = formData.get('reason') as string;
  
  if (!reason?.trim()) throw new Error('Reason required');
  
  const { revokeToken: revokeTokenFn } = await import('@/lib/services/qrTokenService');
  await revokeTokenFn(tokenId, reason.trim(), session.user.id);
  
  revalidatePath(`/qr/${tokenId}`);
}

interface PageProps {
  params: Promise<{ tokenId: string }>;
  searchParams: Promise<{ range?: string }>;
}

export default async function QRDetailPage({ params, searchParams }: PageProps) {
  const session = await auth();
  if (!session) redirect('/login');
  
  const { tokenId } = await params;
  const { range = '7d' } = await searchParams;
  
  const qrDetail = await getQRDetail(tokenId);
  if (!qrDetail) notFound();
  
  const [scanHistory, notes] = await Promise.all([
    getQRScanHistory(tokenId, range as '24h' | '7d' | '30d' | 'all'),
    getQRNotes(tokenId)
  ]);
  
  const baseUrl = getBaseUrl();
  const qrUrl = buildTokenUrl(qrDetail.token, baseUrl);
  
  const canEditRedirect = ['ADMIN', 'PRODUCTION'].includes(session.user.role);
  const canRevoke = session.user.role === 'ADMIN';
  
  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800 border-green-200',
    REVOKED: 'bg-red-100 text-red-800 border-red-200',
    EXPIRED: 'bg-gray-100 text-gray-600 border-gray-200'
  };
  
  const resolutionColors = {
    TOKEN: 'bg-blue-100 text-blue-800',
    GROUP: 'bg-purple-100 text-purple-800',
    DEFAULT: 'bg-gray-100 text-gray-700'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* QR Preview Placeholder */}
          <div className="w-24 h-24 bg-gray-100 border-2 border-gray-300 rounded-lg flex items-center justify-center">
            <svg className="w-16 h-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">QR Token</h1>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${statusColors[qrDetail.status]}`}>
                {qrDetail.status}
              </span>
            </div>
            <code className="text-sm text-gray-500 font-mono mt-1 block">
              {qrDetail.token}
            </code>
            <div className="mt-2 text-sm text-gray-500">
              Created {new Date(qrDetail.printedAt).toLocaleString()}
              {qrDetail.createdBy && ` by ${qrDetail.createdBy.name}`}
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigator.clipboard.writeText(qrUrl)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            Copy URL
          </button>
          <a
            href={qrUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Test Redirect
          </a>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Context & Controls */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section A: QR Context */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">QR Context</h2>
            
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Entity Type</dt>
                <dd className="mt-1 text-sm text-gray-900">{qrDetail.entityType}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Entity</dt>
                <dd className="mt-1">
                  {qrDetail.entityLink ? (
                    <Link href={qrDetail.entityLink} className="text-sm text-blue-600 hover:text-blue-800">
                      {qrDetail.entityName}
                    </Link>
                  ) : (
                    <span className="text-sm text-gray-900">{qrDetail.entityName}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Label Template</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {qrDetail.version?.template?.name || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Version</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {qrDetail.version?.version || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Scan Count</dt>
                <dd className="mt-1 text-sm text-gray-900 font-semibold">{qrDetail.scanCount}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Scanned</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {qrDetail.lastScannedAt 
                    ? new Date(qrDetail.lastScannedAt).toLocaleString()
                    : 'Never'
                  }
                </dd>
              </div>
            </dl>

            {/* Effective Redirect */}
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Effective Redirect</h3>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${resolutionColors[qrDetail.effectiveRedirect.type]}`}>
                  {qrDetail.effectiveRedirect.type}
                </span>
                <a 
                  href={qrDetail.effectiveRedirect.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 truncate flex-1"
                >
                  {qrDetail.effectiveRedirect.url}
                </a>
              </div>
              {qrDetail.effectiveRedirect.ruleName && (
                <p className="text-xs text-gray-500 mt-1">
                  Rule: {qrDetail.effectiveRedirect.ruleName}
                </p>
              )}
            </div>
          </div>

          {/* Section B: Scan History */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Scan History</h2>
              <div className="flex gap-1">
                {(['24h', '7d', '30d', 'all'] as const).map((r) => (
                  <Link
                    key={r}
                    href={`/qr/${tokenId}?range=${r}`}
                    className={`px-3 py-1 text-xs font-medium rounded-md ${
                      range === r
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {r === 'all' ? 'All' : r}
                  </Link>
                ))}
              </div>
            </div>
            
            {scanHistory.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No scans in this time range</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Resolution</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Destination</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rule</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {scanHistory.slice(0, 50).map((scan) => (
                      <tr key={scan.id}>
                        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(scan.timestamp).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${resolutionColors[scan.resolutionType as keyof typeof resolutionColors] || resolutionColors.DEFAULT}`}>
                            {scan.resolutionType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px] truncate">
                          {scan.destination}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {scan.ruleApplied || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section C: Redirect Controls */}
          {qrDetail.status === 'ACTIVE' && (
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Redirect Controls</h2>
              
              {canEditRedirect ? (
                <div className="space-y-4">
                  {/* Token Override */}
                  <form action={setRedirectOverride} className="space-y-3">
                    <input type="hidden" name="tokenId" value={tokenId} />
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Token Redirect Override
                      </label>
                      <input
                        type="url"
                        name="redirectUrl"
                        defaultValue={qrDetail.redirectUrl || ''}
                        placeholder="https://example.com/redirect"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Leave empty to clear override and use group/default routing
                      </p>
                    </div>
                    <button
                      type="submit"
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      Update Override
                    </button>
                  </form>

                  {/* Quick Presets */}
                  <div className="pt-4 border-t border-gray-200">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Quick Presets</h3>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Tripdar Survey', url: 'https://tripdar.com/survey' },
                        { label: 'Fungapedia', url: 'https://fungapedia.com/product' },
                        { label: 'Instagram', url: 'https://instagram.com/psillyops' },
                        { label: 'Recall Notice', url: '/recall-notice' }
                      ].map((preset) => (
                        <form key={preset.label} action={setRedirectOverride}>
                          <input type="hidden" name="tokenId" value={tokenId} />
                          <input type="hidden" name="redirectUrl" value={preset.url} />
                          <button
                            type="submit"
                            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                          >
                            {preset.label}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>

                  {/* Revoke Token */}
                  {canRevoke && (
                    <div className="pt-4 border-t border-gray-200">
                      <h3 className="text-sm font-medium text-red-700 mb-2">Danger Zone</h3>
                      <form action={revokeToken} className="flex gap-2">
                        <input type="hidden" name="tokenId" value={tokenId} />
                        <input
                          type="text"
                          name="reason"
                          placeholder="Reason for revocation"
                          required
                          className="flex-1 px-3 py-2 border border-red-300 rounded-md text-sm"
                        />
                        <button
                          type="submit"
                          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                        >
                          Revoke Token
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  You don&apos;t have permission to modify redirect settings.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right Column - Annotations */}
        <div className="space-y-6">
          {/* Section D: Annotations */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Annotations</h2>
            
            {/* Add Note Form */}
            <form action={addNote} className="mb-4">
              <input type="hidden" name="tokenId" value={tokenId} />
              <textarea
                name="message"
                placeholder="Add a note..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm resize-none"
              />
              <button
                type="submit"
                className="mt-2 px-4 py-2 text-sm font-medium text-white bg-gray-800 rounded-md hover:bg-gray-900"
              >
                Add Note
              </button>
            </form>

            {/* Notes List */}
            {notes.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No notes yet</p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {notes.map((note) => (
                  <div key={note.id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-medium text-gray-700">{note.user}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(note.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{note.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Rule Info */}
          {qrDetail.activeRule && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-purple-800 mb-2">Active Group Rule</h3>
              <p className="text-sm text-purple-700">
                <strong>Destination:</strong> {qrDetail.activeRule.redirectUrl}
              </p>
              {qrDetail.activeRule.reason && (
                <p className="text-xs text-purple-600 mt-1">
                  {qrDetail.activeRule.reason}
                </p>
              )}
              <Link
                href="/qr-redirects"
                className="text-xs text-purple-600 hover:text-purple-800 mt-2 inline-block"
              >
                Manage Rules →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

