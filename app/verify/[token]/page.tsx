/**
 * Public Product Verification Page
 * 
 * Official verification page for QR code scans.
 * Displays authentication status and product information.
 * No authentication required.
 * 
 * ⚠️ CRITICAL INVARIANT:
 * /verify/[token] is the authoritative public verification surface.
 * Redirect rules must NEVER apply here.
 * 
 * This page bypasses all redirect rules (token-level, group rules, fallbacks)
 * to ensure verification truth is never compromised by marketing or ops campaigns.
 * 
 * Trust boundary: Verification is for truth, redirects are for routing.
 */

import { notFound } from 'next/navigation';
import { getTokenByValue } from '@/lib/services/qrTokenService';
import { prisma } from '@/lib/db/prisma';
import { Shield } from 'lucide-react';
import Link from 'next/link';
import {
  resolveVerificationState,
  getVerificationStateLabel,
  getVerificationStateDescription,
  type VerificationState
} from '@/lib/utils/verificationState';
import { VerificationAnimation } from '@/components/verification/VerificationAnimation';
import { VerificationContent } from '@/components/verification/VerificationContent';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function VerificationPage({ params }: PageProps) {
  const { token } = await params;

  // Get token record directly (read-only, no scan count increment)
  // Scan was already logged in /qr/[tokenId] resolver
  const tokenRecord = await getTokenByValue(token);

  if (!tokenRecord) {
    notFound();
  }

  // Resolve verification state using centralized utility
  const verificationState = resolveVerificationState({
    status: tokenRecord.status,
    expiresAt: tokenRecord.expiresAt
  });

  // Build token result structure for compatibility
  const tokenResult = {
    status: tokenRecord.status,
    entityType: tokenRecord.entityType,
    entityId: tokenRecord.entityId,
    message: verificationState === 'REVOKED' 
      ? (tokenRecord.revokedReason || 'This QR code has been revoked')
      : verificationState === 'EXPIRED'
      ? 'This QR code has expired'
      : undefined,
    token: {
      id: tokenRecord.id,
      scanCount: tokenRecord.scanCount,
      printedAt: tokenRecord.printedAt,
      revokedReason: tokenRecord.revokedReason
    }
  };

  // Fetch entity details based on type
  let productName: string | null = null;
  let sku: string | null = null;
  let batchCode: string | null = null;
  let productionDate: Date | null = null;

  if (tokenResult.entityType === 'PRODUCT') {
    const product = await prisma.product.findUnique({
      where: { id: tokenResult.entityId },
      select: { name: true, sku: true }
    });
    if (product) {
      productName = product.name;
      sku = product.sku;
    }
  } else if (tokenResult.entityType === 'BATCH') {
    const batch = await prisma.batch.findUnique({
      where: { id: tokenResult.entityId },
      select: {
        batchCode: true,
        productionDate: true,
        product: {
          select: { name: true, sku: true }
        }
      }
    });
    if (batch) {
      productName = batch.product.name;
      sku = batch.product.sku;
      batchCode = batch.batchCode;
      productionDate = batch.productionDate;
    }
  }

  // Use resolved verification state
  const isVerified = verificationState === 'VERIFIED';
  const isRevoked = verificationState === 'REVOKED';
  const isExpired = verificationState === 'EXPIRED';

  // Get canonical labels and descriptions
  const stateLabel = getVerificationStateLabel(verificationState);
  const stateDescription = getVerificationStateDescription(verificationState);

  // Verification timestamp (current scan time)
  const verifiedAt = new Date();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-gray-600" />
            <h1 className="text-sm font-medium text-gray-600">Product Verification</h1>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        {/* Verification Animation Component (Client) */}
        <VerificationAnimation
          verificationState={verificationState}
          stateLabel={stateLabel}
          stateDescription={stateDescription}
          revokedReason={tokenResult.token?.revokedReason}
        />

        {/* Product Information & Verification Details (Client - fade in after animation) */}
        <VerificationContent
          productName={productName}
          sku={sku}
          batchCode={batchCode}
          productionDate={productionDate}
          verificationState={verificationState}
          verifiedAt={verifiedAt}
          scanCount={tokenRecord.scanCount}
          revokedReason={tokenResult.token?.revokedReason}
          token={token}
        />

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pt-4">
          <p>© {new Date().getFullYear()} PsillyOps</p>
        </div>
      </main>
    </div>
  );
}

