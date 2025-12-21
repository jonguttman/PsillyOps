'use client';

/**
 * Verification Content Component
 * 
 * Client component that handles the fade-in reveal of product information
 * and verification details after the animation completes.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface VerificationContentProps {
  productName: string | null;
  sku: string | null;
  batchCode: string | null;
  productionDate: Date | null;
  verificationState: 'VERIFIED' | 'REVOKED' | 'EXPIRED' | 'UNKNOWN';
  verifiedAt: Date;
  scanCount: number;
  revokedReason: string | null | undefined;
  token: string;
  onAnimationComplete?: () => void;
}

export function VerificationContent({
  productName,
  sku,
  batchCode,
  productionDate,
  verificationState,
  verifiedAt,
  scanCount,
  revokedReason,
  token,
  onAnimationComplete
}: VerificationContentProps) {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    // Wait for animation to complete, then show content
    // Content fades in at the same time as verification status (same frame)
    const timer = setTimeout(() => {
      setShowContent(true);
      onAnimationComplete?.();
    }, 700); // 700ms animation - content reveals with verification status

    return () => clearTimeout(timer);
  }, [onAnimationComplete]);

  const isVerified = verificationState === 'VERIFIED';

  return (
    <>
      {/* Product Information */}
      {productName && (
        <div
          className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 transition-opacity duration-200 ${
            showContent ? 'opacity-100' : 'opacity-0'
          }`}
        >
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

      {/* Verification Details */}
      <div
        className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 transition-opacity duration-200 ${
          showContent ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <h3 className="text-sm font-medium text-gray-500 mb-4">Verification Details</h3>
        <dl className="space-y-3">
          <div>
            <dt className="text-xs text-gray-400 mb-1">Verification Status</dt>
            <dd className="text-sm font-medium text-gray-900">
              {isVerified && <span className="text-green-600">Verified</span>}
              {verificationState === 'REVOKED' && <span className="text-amber-600">Revoked</span>}
              {verificationState === 'EXPIRED' && <span className="text-amber-600">Expired</span>}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400 mb-1">Verified on</dt>
            <dd className="text-sm text-gray-700">
              {verifiedAt.toLocaleString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short'
              })}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-400 mb-1">Total Scans</dt>
            <dd className="text-sm text-gray-700">{scanCount}</dd>
          </div>
          {verificationState === 'REVOKED' && revokedReason && (
            <div>
              <dt className="text-xs text-gray-400 mb-1">Revocation Reason</dt>
              <dd className="text-sm text-gray-700">{revokedReason}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Transparency Link (only for verified products) */}
      {isVerified && (
        <div
          className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 transition-opacity duration-200 ${
            showContent ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Link
            href={`/qr/transparency/${token}`}
            className="block text-center text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            View full transparency details →
          </Link>
        </div>
      )}
    </>
  );
}

