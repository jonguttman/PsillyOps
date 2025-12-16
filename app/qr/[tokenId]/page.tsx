// QR Token Resolver Page
// Handles public scanning of QR tokens and redirects to entity pages
// Supports three-level redirect precedence:
// 1. Token-level redirectUrl (highest priority)
// 2. Active QRRedirectRule (group-based)
// 3. Default entity routing (fallback)

import { resolveToken, isValidTokenFormat, getTokenByValue } from '@/lib/services/qrTokenService';
import { findActiveRedirectRule } from '@/lib/services/qrRedirectService';
import { logAction } from '@/lib/services/loggingService';
import { ActivityEntity } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';

interface Props {
  params: Promise<{ tokenId: string }>;
}

export default async function QRTokenResolverPage({ params }: Props) {
  const { tokenId: token } = await params;

  // Validate token format first
  if (!isValidTokenFormat(token)) {
    notFound();
  }

  // Resolve the token
  const result = await resolveToken(token);

  if (!result) {
    notFound();
  }

  // If token is active, determine redirect destination
  if (result.status === 'ACTIVE') {
    let destination: string;
    let resolutionType: 'TOKEN' | 'GROUP' | 'DEFAULT';
    let ruleId: string | null = null;

    // Get the full token record to check for token-level redirect
    const tokenRecord = await getTokenByValue(token);

    // 1. Check token-level redirectUrl (highest precedence)
    if (tokenRecord?.redirectUrl) {
      destination = tokenRecord.redirectUrl;
      resolutionType = 'TOKEN';
    } else {
      // 2. Check for active QRRedirectRule
      const rule = await findActiveRedirectRule({
        entityType: result.entityType,
        entityId: result.entityId,
        versionId: tokenRecord?.versionId
      });

      if (rule) {
        destination = rule.redirectUrl;
        resolutionType = 'GROUP';
        ruleId = rule.id;
      } else {
        // 3. Fallback to default entity routing
        destination = getRedirectPath(result.entityType, result.entityId);
        resolutionType = 'DEFAULT';
      }
    }

    // Phase 5.1: If this token is bound to a ProductionRun, log a production-run scan event
    // and prefer routing to the run page.
    const productionRun = tokenRecord
      ? await prisma.productionRun.findFirst({
          where: { qrTokenId: tokenRecord.id },
          include: {
            product: { select: { id: true, name: true, sku: true } },
            steps: { orderBy: { order: 'asc' } },
          },
        })
      : null;

    if (productionRun) {
      const inProgress = productionRun.steps.find((s) => s.status === 'IN_PROGRESS');
      const nextPending = productionRun.steps.find((s) => s.status === 'PENDING');
      const current = inProgress || nextPending;

      destination = `/production-runs/${productionRun.id}`;
      resolutionType = 'TOKEN';

      await logAction({
        entityType: ActivityEntity.PRODUCTION_RUN,
        entityId: productionRun.id,
        action: 'qr_scanned_production_run',
        summary: `QR scanned: Production run for ${productionRun.product.name} × ${productionRun.quantity}`,
        metadata: {
          runStatus: productionRun.status,
          currentStep: current
            ? {
                stepKey: current.templateKey,
                stepLabel: current.label,
                stepStatus: current.status,
                order: current.order,
              }
            : null,
          tokenId: tokenRecord?.id,
          token: tokenRecord?.token,
          scanCount: result.token?.scanCount,
        },
        tags: ['qr', 'scan', 'production'],
      });
    } else {
      // Log ALL scans with resolution metadata (label / general tokens)
      // This captures scan-time destination for audit and analytics
      await logAction({
        entityType: ActivityEntity.LABEL,
        entityId: result.entityId,
        action: 'qr_token_scanned',
        summary: `QR token scanned for ${result.entityType} ${result.entityId} → ${resolutionType} resolution`,
        metadata: {
          tokenId: result.token?.id,
          entityType: result.entityType,
          entityId: result.entityId,
          resolutionType,
          redirectUrl: destination,
          ruleId,
          scanCount: result.token?.scanCount
        },
        tags: ['qr', 'label', 'scan', resolutionType.toLowerCase()]
      });
    }

    redirect(destination);
  }

  // Token is revoked or expired - show info page
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className={`py-4 px-6 ${result.status === 'REVOKED' ? 'bg-red-600' : 'bg-amber-600'} text-white`}>
        <div className="max-w-2xl mx-auto">
          <div className="text-sm opacity-80 mb-1">QR Code Status</div>
          <h1 className="text-2xl font-bold">
            {result.status === 'REVOKED' ? 'This QR Code Has Been Revoked' : 'This QR Code Has Expired'}
          </h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Status Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start space-x-4">
            {result.status === 'REVOKED' ? (
              <div className="flex-shrink-0">
                <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
            ) : (
              <div className="flex-shrink-0">
                <svg className="w-12 h-12 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">
                {result.status === 'REVOKED' ? 'Revoked Label' : 'Expired Label'}
              </h2>
              <p className="mt-2 text-gray-600">
                {result.message}
              </p>
              
              {result.status === 'REVOKED' && result.token?.revokedReason && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">
                    <strong>Reason:</strong> {result.token.revokedReason}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* What This Means */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">What This Means</h3>
          {result.status === 'REVOKED' ? (
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="flex-shrink-0 w-5 h-5 text-red-500 mr-2">•</span>
                This label has been invalidated by an administrator
              </li>
              <li className="flex items-start">
                <span className="flex-shrink-0 w-5 h-5 text-red-500 mr-2">•</span>
                The product may be subject to a recall or quality issue
              </li>
              <li className="flex items-start">
                <span className="flex-shrink-0 w-5 h-5 text-red-500 mr-2">•</span>
                Please contact us for more information or a replacement
              </li>
            </ul>
          ) : (
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start">
                <span className="flex-shrink-0 w-5 h-5 text-amber-500 mr-2">•</span>
                This label has passed its validity period
              </li>
              <li className="flex items-start">
                <span className="flex-shrink-0 w-5 h-5 text-amber-500 mr-2">•</span>
                The product information may no longer be accurate
              </li>
              <li className="flex items-start">
                <span className="flex-shrink-0 w-5 h-5 text-amber-500 mr-2">•</span>
                Please check the product packaging for current information
              </li>
            </ul>
          )}
        </div>

        {/* Token Info (non-sensitive) */}
        {result.token && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-3">Label Information</h3>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-400">Type</dt>
                <dd className="font-medium text-gray-900">{formatEntityType(result.entityType)}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Printed</dt>
                <dd className="font-medium text-gray-900">
                  {new Date(result.token.printedAt).toLocaleDateString()}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400">Scan Count</dt>
                <dd className="font-medium text-gray-900">{result.token.scanCount}</dd>
              </div>
            </dl>
          </div>
        )}

        {/* Contact */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Need Help?</h3>
          <p className="text-sm text-blue-700">
            If you have questions about this product or need assistance, please contact our team.
          </p>
          <div className="mt-4">
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2 border border-blue-600 text-sm font-medium rounded-md text-blue-600 bg-white hover:bg-blue-50"
            >
              Return to Home
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pt-4">
          Token: {token.slice(0, 10)}...
        </div>
      </div>
    </div>
  );
}

/**
 * Get the redirect path for an entity type
 */
function getRedirectPath(entityType: string, entityId: string): string {
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

/**
 * Format entity type for display
 */
function formatEntityType(entityType: string): string {
  switch (entityType) {
    case 'PRODUCT':
      return 'Product';
    case 'BATCH':
      return 'Batch';
    case 'INVENTORY':
      return 'Inventory Item';
    case 'CUSTOM':
      return 'Custom';
    default:
      return entityType;
  }
}

