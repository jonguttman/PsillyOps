/**
 * Public Transparency Page
 * 
 * Customer-facing page that displays product transparency information.
 * Accessed via QR code scan - no authentication required.
 */

import { notFound } from 'next/navigation';
import { resolveToken } from '@/lib/services/qrTokenService';
import {
  getPublicTransparencyRecord,
  getTransparencyCopy,
  getEntityDetails,
} from '@/lib/services/transparencyService';
import { Shield, CheckCircle, Clock, FlaskConical, Leaf, Package } from 'lucide-react';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function TransparencyPage({ params }: PageProps) {
  const { token } = await params;

  // Resolve the token to get entity info
  const tokenResult = await resolveToken(token);

  if (!tokenResult || tokenResult.status !== 'ACTIVE') {
    // Token not found or not active
    return <FallbackPage message="This QR code is not valid or has expired." />;
  }

  // Map LabelEntityType to ActivityEntity
  const entityType = tokenResult.entityType === 'PRODUCT' ? 'PRODUCT' : 
                     tokenResult.entityType === 'BATCH' ? 'BATCH' : null;

  if (!entityType) {
    return <FallbackPage message="Transparency information is not available for this item type." />;
  }

  // Fetch transparency record
  const record = await getPublicTransparencyRecord(entityType, tokenResult.entityId);

  if (!record) {
    return <FallbackPage message="Transparency information is not yet available for this product." />;
  }

  // FAIL results are suppressed from public view
  if (record.testResult === 'FAIL') {
    return <FallbackPage message="Transparency information is not available for this product." />;
  }

  // Fetch copy and entity details
  const [copy, entityDetails] = await Promise.all([
    getTransparencyCopy(),
    getEntityDetails(entityType, tokenResult.entityId),
  ]);

  const productName = entityDetails?.name || 'Unknown Product';
  const sku = entityDetails?.sku;
  const batchCode = record.batchCode || entityDetails?.batchCode;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <Shield className="w-6 h-6 text-blue-600" />
          <h1 className="text-lg font-semibold text-gray-900">Product Transparency</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Product Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-900 truncate">{productName}</h2>
              {sku && (
                <p className="text-sm text-gray-500">SKU: {sku}</p>
              )}
              {batchCode && (
                <p className="text-sm text-gray-500">Batch: {batchCode}</p>
              )}
              <p className="text-sm text-gray-500 mt-1">
                Produced: {new Date(record.productionDate).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Test Status Banner */}
        <TestStatusBanner 
          result={record.testResult} 
          copy={record.testResult === 'PASS' ? copy.TRANSPARENCY_PASS_COPY : copy.TRANSPARENCY_PENDING_COPY}
        />

        {/* Lab Info */}
        {record.labNameSnapshot && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                <FlaskConical className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Testing Laboratory</h3>
                <p className="text-gray-700">{record.labNameSnapshot}</p>
                {record.lab?.location && (
                  <p className="text-sm text-gray-500">{record.lab.location}</p>
                )}
                {record.testDate && (
                  <p className="text-sm text-gray-500 mt-1">
                    Tested: {new Date(record.testDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Raw Material Confirmation */}
        {record.rawMaterialLinked && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                <Leaf className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Raw Materials</h3>
                <p className="text-gray-600 text-sm">{copy.TRANSPARENCY_RAW_MATERIAL_COPY}</p>
              </div>
            </div>
          </div>
        )}

        {/* Public Description */}
        {record.publicDescription && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
            <h3 className="font-medium text-gray-900 mb-2">About This Product</h3>
            <p className="text-gray-600 text-sm whitespace-pre-line">{record.publicDescription}</p>
          </div>
        )}

        {/* Footer Trust Statement */}
        <div className="text-center pt-4 pb-8">
          <p className="text-sm text-gray-500">{copy.TRANSPARENCY_FOOTER_COPY}</p>
        </div>
      </main>
    </div>
  );
}

function TestStatusBanner({ result, copy }: { result: string | null; copy: string }) {
  if (result === 'PASS') {
    return (
      <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-3 mb-2">
          <CheckCircle className="w-6 h-6" />
          <span className="text-lg font-bold">Testing Passed</span>
        </div>
        <p className="text-green-50 text-sm">{copy}</p>
      </div>
    );
  }

  if (result === 'PENDING') {
    return (
      <div className="bg-gradient-to-r from-amber-400 to-yellow-400 rounded-2xl p-5 text-amber-900">
        <div className="flex items-center gap-3 mb-2">
          <Clock className="w-6 h-6" />
          <span className="text-lg font-bold">Testing Pending</span>
        </div>
        <p className="text-amber-800 text-sm">{copy}</p>
      </div>
    );
  }

  // No result set
  return (
    <div className="bg-gray-100 rounded-2xl p-5 text-gray-700">
      <div className="flex items-center gap-3 mb-2">
        <Clock className="w-6 h-6 text-gray-500" />
        <span className="text-lg font-bold">Testing Status</span>
      </div>
      <p className="text-gray-600 text-sm">Testing information is being processed.</p>
    </div>
  );
}

function FallbackPage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-8 h-8 text-gray-400" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Transparency Info</h1>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}

