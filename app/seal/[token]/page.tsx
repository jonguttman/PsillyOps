/**
 * TripDAR Seal Page Contract
 * 
 * INVARIANTS:
 * - Read-only (no writes, no state mutation)
 * - Never redirects (always renders)
 * - Never asserts product authenticity (that's /verify's job)
 * - Never increments scanCount (separate tracking)
 * - Never includes marketing language
 * 
 * Shared logic intentionally duplicated from verificationState.ts
 * to preserve semantic isolation between authenticity and certification.
 */

import { notFound } from 'next/navigation';
import { getTokenByValue } from '@/lib/services/qrTokenService';
import { getPublicTransparencyRecord } from '@/lib/services/transparencyService';
import { logAction } from '@/lib/services/loggingService';
import { prisma } from '@/lib/db/prisma';
import { ActivityEntity } from '@prisma/client';
import Link from 'next/link';
import {
  resolveSealState,
  getSealStateLabel,
  getSealStateDescription,
  type SealState
} from '@/lib/utils/sealState';
import { Shield, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function SealPage({ params }: PageProps) {
  const { token } = await params;

  // Get token record with seal sheet and binding data
  const tokenRecord = await prisma.qRToken.findUnique({
    where: { token },
    include: {
      sealSheet: {
        select: {
          id: true,
          status: true,
          partnerId: true,
        },
      },
      experienceBinding: {
        select: {
          id: true,
          isRebind: true,
        },
      },
    },
  });

  if (!tokenRecord) {
    notFound();
  }

  // Resolve seal state using centralized utility (Phase 2B)
  const sealState = resolveSealState({
    status: tokenRecord.status,
    expiresAt: tokenRecord.expiresAt,
    sealSheet: tokenRecord.sealSheet
      ? {
          status: tokenRecord.sealSheet.status,
          partnerId: tokenRecord.sealSheet.partnerId,
        }
      : null,
    hasBinding: !!tokenRecord.experienceBinding,
  });

  // Map LabelEntityType to ActivityEntity for transparency lookup
  const entityType = tokenRecord.entityType === 'PRODUCT' ? ActivityEntity.PRODUCT : 
                     tokenRecord.entityType === 'BATCH' ? ActivityEntity.BATCH : null;

  // Fetch entity details and transparency record in parallel
  let productName: string | null = null;
  let sku: string | null = null;
  let batchCode: string | null = null;
  let productionDate: Date | null = null;
  let transparencyRecord = null;

  if (tokenRecord.entityType === 'PRODUCT') {
    const [product, transparency] = await Promise.all([
      prisma.product.findUnique({
        where: { id: tokenRecord.entityId },
        select: { name: true, sku: true }
      }),
      entityType ? getPublicTransparencyRecord(entityType, tokenRecord.entityId) : null
    ]);
    if (product) {
      productName = product.name;
      sku = product.sku;
    }
    transparencyRecord = transparency;
  } else if (tokenRecord.entityType === 'BATCH') {
    const [batch, transparency] = await Promise.all([
      prisma.batch.findUnique({
        where: { id: tokenRecord.entityId },
        select: {
          batchCode: true,
          productionDate: true,
          product: {
            select: { name: true, sku: true }
          }
        }
      }),
      entityType ? getPublicTransparencyRecord(entityType, tokenRecord.entityId) : null
    ]);
    if (batch) {
      productName = batch.product.name;
      sku = batch.product.sku;
      batchCode = batch.batchCode;
      productionDate = batch.productionDate;
    }
    transparencyRecord = transparency;
  }

  // Log seal page view (always log, even for revoked/expired)
  await logAction({
    entityType: ActivityEntity.LABEL,
    entityId: tokenRecord.entityId,
    action: 'seal_page_viewed',
    summary: `Seal page viewed for ${tokenRecord.entityType} ${tokenRecord.entityId}`,
    metadata: {
      tokenId: tokenRecord.id,
      token: tokenRecord.token,
      entityType: tokenRecord.entityType,
      entityId: tokenRecord.entityId,
      tokenStatus: tokenRecord.status,
      scanSurface: 'seal',
      scanContext: 'certification_participation',
      surfaceVersion: 'seal_v1',
      logCategory: 'certification',  // Semantic distinction for analytics
      viewedAt: new Date().toISOString(),
    },
    tags: ['seal', 'tripdar', 'certification', 'view']
  });

  // Get canonical labels and descriptions
  const stateLabel = getSealStateLabel(sealState);
  const stateDescription = getSealStateDescription(sealState);
  const isActive = sealState === 'ACTIVE';
  const isRevoked = sealState === 'REVOKED';
  const isExpired = sealState === 'EXPIRED';
  const isUnbound = sealState === 'SEAL_UNBOUND' || sealState === 'SHEET_UNASSIGNED';

  // Get state config for display
  const getStateConfig = () => {
    switch (sealState) {
      case 'ACTIVE':
        return {
          icon: CheckCircle,
          iconColor: 'text-green-600',
          bgColor: 'bg-green-100',
          borderColor: 'border-green-200'
        };
      case 'SHEET_UNASSIGNED':
      case 'SEAL_UNBOUND':
        return {
          icon: AlertTriangle,
          iconColor: 'text-blue-600',
          bgColor: 'bg-blue-100',
          borderColor: 'border-blue-200'
        };
      case 'REVOKED':
        return {
          icon: XCircle,
          iconColor: 'text-amber-600',
          bgColor: 'bg-amber-100',
          borderColor: 'border-amber-200'
        };
      case 'EXPIRED':
        return {
          icon: AlertTriangle,
          iconColor: 'text-amber-600',
          bgColor: 'bg-amber-100',
          borderColor: 'border-amber-200'
        };
      default:
        return {
          icon: AlertTriangle,
          iconColor: 'text-gray-600',
          bgColor: 'bg-gray-100',
          borderColor: 'border-gray-200'
        };
    }
  };

  const config = getStateConfig();
  const Icon = config.icon;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-gray-600" />
            <h1 className="text-sm font-medium text-gray-600">TripDAR Certification</h1>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        {/* Certification Status */}
        <div className={`bg-white rounded-lg shadow-sm border ${config.borderColor} p-6 mb-6`}>
          <div className="text-center">
            {/* Status Icon */}
            <div className="flex justify-center mb-4">
              <div className={`w-16 h-16 rounded-full ${config.bgColor} flex items-center justify-center`}>
                <Icon className={`w-10 h-10 ${config.iconColor}`} />
              </div>
            </div>

            {/* Status Text */}
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {stateLabel}
            </h2>

            {/* Status Description */}
            <p className="text-gray-600 text-sm mb-4">
              {stateDescription}
            </p>

            {/* Rebind Notice (Phase 2C) */}
            {tokenRecord.experienceBinding?.isRebind && (
              <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded-md">
                <p className="text-xs text-gray-500">
                  Reassigned during production labeling
                </p>
              </div>
            )}

            {/* Revocation Reason */}
            {isRevoked && tokenRecord.revokedReason && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm text-amber-800">
                  <strong>Reason:</strong> {tokenRecord.revokedReason}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Product Information */}
        {productName && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-sm font-medium text-gray-500 mb-4">Product Information</h3>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-gray-400 mb-1">Product Name</dt>
                <dd className="text-base font-medium text-gray-900">{productName}</dd>
              </div>
              {sku && (
                <div>
                  <dt className="text-xs text-gray-400 mb-1">SKU</dt>
                  <dd className="text-sm text-gray-700">{sku}</dd>
                </div>
              )}
              {batchCode && (
                <div>
                  <dt className="text-xs text-gray-400 mb-1">Batch Code</dt>
                  <dd className="text-sm font-medium text-gray-900">{batchCode}</dd>
                </div>
              )}
              {productionDate && (
                <div>
                  <dt className="text-xs text-gray-400 mb-1">Production Date</dt>
                  <dd className="text-sm text-gray-700">
                    {new Date(productionDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Transparency Status */}
        {isActive && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Transparency Data</h3>
            {transparencyRecord ? (
              <p className="text-sm text-gray-700">
                Transparency data is available for this product.
              </p>
            ) : (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                <p className="text-sm text-gray-600">
                  Transparency data has not yet been published for this product.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Certification Explanation */}
        {isActive && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <p className="text-sm text-gray-700 mb-3">
              This product participates in TripDAR, an anonymous experience data collection system.
            </p>
            <p className="text-xs text-gray-500 mt-2">
              TripDAR certification does not rate or evaluate product quality or outcomes.
            </p>
            <p className="text-xs text-gray-500">
              Participation does not imply or guarantee any specific experience or outcome. 
              Experience data is collected anonymously and used to improve product understanding.
            </p>
          </div>
        )}

        {/* Participation CTA (only for ACTIVE tokens) */}
        {isActive && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            {/* Survey is intentionally routed to a separate page.
                Do not embed inline to preserve seal page neutrality. */}
            <Link
              href={`/tripdar/survey/${token}`}
              className="block w-full text-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Compare Your Experience
            </Link>
          </div>
        )}

        {/* Unbound state message */}
        {isUnbound && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800">
              This seal is ready but not yet activated. It will be available for participation once assigned to a product.
            </p>
          </div>
        )}

        {/* Footer Link to Verification */}
        <div className="text-center mb-6">
          <Link
            href={`/verify/${token}`}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            View product authenticity record →
          </Link>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pt-4">
          <p>© {new Date().getFullYear()} PsillyOps</p>
        </div>
      </main>
    </div>
  );
}

