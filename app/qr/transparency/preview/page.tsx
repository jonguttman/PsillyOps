/**
 * Admin Preview: Transparency Page
 * 
 * Allows admins to preview the public transparency page without creating a token.
 * Uses the same renderer as the public page.
 * 
 * Route: /qr/transparency/preview?entityType=PRODUCT&entityId=xxx
 */

import { auth } from '@/lib/auth/auth';
import { redirect, notFound } from 'next/navigation';
import {
  getPublicTransparencyRecord,
  getTransparencyCopy,
  getEntityDetails,
  isPubliclyVisible,
} from '@/lib/services/transparencyService';
import { ActivityEntity } from '@prisma/client';
import { Shield, CheckCircle, Clock, FlaskConical, Leaf, Package, Eye, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface PageProps {
  searchParams: Promise<{ entityType?: string; entityId?: string }>;
}

export default async function TransparencyPreviewPage({ searchParams }: PageProps) {
  // Require admin authentication
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }
  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  const params = await searchParams;
  const { entityType, entityId } = params;

  // Validate parameters
  if (!entityType || !entityId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Preview Error</h1>
          <p className="text-gray-600 mb-4">Missing entityType or entityId parameter.</p>
          <Link
            href="/ops/transparency"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Transparency
          </Link>
        </div>
      </div>
    );
  }

  // Validate entity type
  if (entityType !== 'PRODUCT' && entityType !== 'BATCH') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Entity Type</h1>
          <p className="text-gray-600">Only PRODUCT and BATCH are supported.</p>
        </div>
      </div>
    );
  }

  // Fetch transparency record (including FAIL for admin preview)
  const record = await getPublicTransparencyRecord(entityType as ActivityEntity, entityId);

  if (!record) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
        <PreviewBanner />
        <div className="flex items-center justify-center p-4 pt-20">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
            <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">No Record Found</h1>
            <p className="text-gray-600 mb-4">
              No transparency record exists for this {entityType.toLowerCase()}.
            </p>
            <Link
              href="/ops/transparency/records/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Record
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Fetch copy and entity details
  const [copy, entityDetails] = await Promise.all([
    getTransparencyCopy(),
    getEntityDetails(entityType as ActivityEntity, entityId),
  ]);

  const productName = entityDetails?.name || 'Unknown Product';
  const sku = entityDetails?.sku;
  const batchCode = record.batchCode || entityDetails?.batchCode;

  // Check visibility status for admin notice
  const isVisible = isPubliclyVisible(record);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* Admin Preview Banner */}
      <PreviewBanner isVisible={isVisible} testResult={record.testResult} />

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-12 z-10">
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
          copy={
            record.testResult === 'PASS' ? copy.TRANSPARENCY_PASS_COPY :
            record.testResult === 'FAIL' ? copy.TRANSPARENCY_FAIL_COPY :
            copy.TRANSPARENCY_PENDING_COPY
          }
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

function PreviewBanner({ isVisible = true, testResult }: { isVisible?: boolean; testResult?: string | null }) {
  return (
    <div className={`fixed top-0 left-0 right-0 z-20 px-4 py-2 text-center text-sm font-medium ${
      isVisible 
        ? 'bg-blue-600 text-white' 
        : 'bg-red-600 text-white'
    }`}>
      <div className="flex items-center justify-center gap-2">
        <Eye className="w-4 h-4" />
        <span>
          Admin Preview
          {!isVisible && testResult === 'FAIL' && ' — This record is NOT publicly visible (FAIL status)'}
        </span>
        <Link 
          href="/ops/transparency" 
          className="ml-4 underline hover:no-underline"
        >
          Back to Admin
        </Link>
      </div>
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

  if (result === 'FAIL') {
    return (
      <div className="bg-gradient-to-r from-red-500 to-rose-500 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-6 h-6" />
          <span className="text-lg font-bold">Testing Failed</span>
        </div>
        <p className="text-red-50 text-sm">{copy}</p>
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

