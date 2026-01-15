// QR Token Resolver Page
// Handles public scanning of QR tokens and routes to verification or entity pages
// 
// Behavior:
// - Default (public scans): Routes to /verify/[token] for verification-first experience
// - ?mode=ops: Preserves existing redirect behavior (campaigns, recalls, entity pages)
//
// Supports redirect precedence (ops mode only):
// 1. Token-level redirectUrl (highest priority)
// 2. Transparency record (if exists for product/batch)
// 3. Active QRRedirectRule (group-based)
// 4. Default Redirect (fallback)
// 5. Default entity routing

import { resolveToken, isValidTokenFormat, getTokenByValue } from '@/lib/services/qrTokenService';
import { findActiveRedirectRule } from '@/lib/services/qrRedirectService';
import { getPublicTransparencyRecord, isPubliclyVisible } from '@/lib/services/transparencyService';
import { logAction } from '@/lib/services/loggingService';
import { extractClientIP, getGeoFromRequest } from '@/lib/utils/geoip';
import { ActivityEntity } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';

interface Props {
  params: Promise<{ tokenId: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function QRTokenResolverPage({ params, searchParams }: Props) {
  const { tokenId: token } = await params;
  const { mode } = await searchParams;
  
  // Check if this is an ops scan
  const isOpsMode = mode === 'ops';

  // Validate token format first
  if (!isValidTokenFormat(token)) {
    notFound();
  }

  // Capture request context for geo/IP logging (passive, no permission needed)
  const headersList = await headers();
  const clientIP = extractClientIP(headersList);
  const geo = await getGeoFromRequest(headersList);

  // Resolve the token
  const result = await resolveToken(token);

  if (!result) {
    notFound();
  }

  // If token is active, determine routing behavior
  if (result.status === 'ACTIVE') {
    // Get the full token record
    const tokenRecord = await getTokenByValue(token);
    
    // Phase 1: Default behavior is verification-first (public scans)
    // Ops mode preserves existing redirect behavior
    if (!isOpsMode) {
      // Public scan: Route to verification page
      // Verification bypasses all redirect rules
      const verifiedAt = new Date();
      
      // Log scan with verification context
      await logAction({
        entityType: ActivityEntity.LABEL,
        entityId: result.entityId,
        action: 'qr_token_scanned',
        summary: `QR token scanned for ${result.entityType} ${result.entityId} → verification`,
        metadata: {
          tokenId: result.token?.id,
          entityType: result.entityType,
          entityId: result.entityId,
          resolutionType: 'VERIFICATION',
          scanContext: 'public_verification',
          surface: 'public',
          isOpsScan: false,
          verifiedAt: verifiedAt.toISOString(),
          scanCount: result.token?.scanCount
        },
        tags: ['qr', 'label', 'scan', 'verification']
      });
      
      // Route to verification page
      redirect(`/verify/${token}`);
    }
    
    // Ops mode: Preserve existing redirect behavior
    let destination: string = '';
    let resolutionType: 'TOKEN' | 'BATCH' | 'PRODUCT' | 'ENTITY' | 'VERSION' | 'FALLBACK' | 'TRANSPARENCY' | 'DEFAULT' = 'DEFAULT';
    let ruleId: string | null = null;

    // 1. Check token-level redirectUrl (highest precedence)
    if (tokenRecord?.redirectUrl) {
      destination = tokenRecord.redirectUrl;
      resolutionType = 'TOKEN';
    } else {
      // 2. Check for transparency record (for PRODUCT or BATCH entities)
      const transparencyEntityType = result.entityType === 'PRODUCT' ? 'PRODUCT' : 
                                     result.entityType === 'BATCH' ? 'BATCH' : null;
      
      if (transparencyEntityType) {
        const transparencyRecord = await getPublicTransparencyRecord(
          transparencyEntityType,
          result.entityId
        );
        
        if (transparencyRecord && isPubliclyVisible(transparencyRecord)) {
          // Route to transparency page with the actual token
          destination = `/qr/transparency/${token}`;
          resolutionType = 'TRANSPARENCY';
        }
      }

      // 3. If no transparency record, check for active QRRedirectRule
      if (!destination) {
        const rule = await findActiveRedirectRule({
          entityType: result.entityType,
          entityId: result.entityId,
          versionId: tokenRecord?.versionId
        });

        if (rule) {
          destination = rule.redirectUrl;
          resolutionType = rule.matchedBy; // BATCH, PRODUCT, ENTITY, VERSION, or FALLBACK
          ruleId = rule.id;
        } else {
          // 4. No rule matched - use default entity routing
          destination = getRedirectPath(result.entityType, result.entityId, token);
          resolutionType = 'DEFAULT';
        }
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
        ipAddress: clientIP,
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
          scanContext: 'ops_scan',
          surface: 'ops',
          isOpsScan: true,
          verifiedAt: new Date().toISOString(),
        },
        tags: ['qr', 'scan', 'production'],
      });
    } else {
      // Log ops scans with resolution metadata (label / general tokens)
      // This captures scan-time destination for audit and analytics
      const verifiedAt = new Date();
      await logAction({
        entityType: ActivityEntity.LABEL,
        entityId: result.entityId,
        action: 'qr_token_scanned',
        ipAddress: clientIP,
        summary: `QR token scanned for ${result.entityType} ${result.entityId} → ${resolutionType} resolution`,
        metadata: {
          tokenId: result.token?.id,
          entityType: result.entityType,
          entityId: result.entityId,
          resolutionType,
          redirectUrl: destination,
          ruleId,
          scanCount: result.token?.scanCount,
          scanContext: 'ops_scan',
          surface: 'ops',
          isOpsScan: true,
          verifiedAt: verifiedAt.toISOString(),
        },
        tags: ['qr', 'label', 'scan', resolutionType.toLowerCase()]
      });
    }

    redirect(destination);
  }
  
  // Token is revoked or expired - route to verification page
  // Verification page will show appropriate status
  if (!isOpsMode) {
    const verifiedAt = new Date();
    
    // Log scan even for revoked/expired tokens (for analytics)
    await logAction({
      entityType: ActivityEntity.LABEL,
      entityId: result.entityId,
      action: 'qr_token_scanned',
      summary: `QR token scanned for ${result.entityType} ${result.entityId} → ${result.status}`,
      metadata: {
        tokenId: result.token?.id,
        entityType: result.entityType,
        entityId: result.entityId,
        resolutionType: result.status,
        scanContext: 'public_verification',
        surface: 'public',
        isOpsScan: false,
        verifiedAt: verifiedAt.toISOString(),
        scanCount: result.token?.scanCount,
        revokedReason: result.token?.revokedReason,
      },
      tags: ['qr', 'label', 'scan', result.status.toLowerCase()]
    });
    
    redirect(`/verify/${token}`);
  }
  
  // Ops mode: Show existing revoked/expired page for internal users

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
 * Includes ?t= token param to pass scan context to authenticity pages
 */
function getRedirectPath(entityType: string, entityId: string, tokenCode: string): string {
  const tokenParam = `?t=${tokenCode}`;
  switch (entityType) {
    case 'PRODUCT':
      return `/qr/product/${entityId}${tokenParam}`;
    case 'BATCH':
      return `/qr/batch/${entityId}${tokenParam}`;
    case 'INVENTORY':
      return `/qr/inventory/${entityId}${tokenParam}`;
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

