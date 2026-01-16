import { prisma } from '@/lib/db/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { QualityData } from '@/lib/types/qualityData';
import {
  DEFAULT_QUALITY_DISCLAIMER,
  SAFETY_STATUS_LABELS,
  SAFETY_STATUS_STYLES,
  COMPONENT_LEVEL_LABELS,
  COMPONENT_LEVEL_STYLES,
} from '@/lib/types/qualityData';

interface Props {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ t?: string }>;
}

export default async function BatchAuthenticityPage({ params, searchParams }: Props) {
  const { batchId } = await params;
  const { t: tokenCode } = await searchParams;

  // Fetch batch with product and strain info
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      product: {
        include: {
          strain: {
            select: { id: true, name: true, shortCode: true }
          }
        }
      }
    }
  });

  if (!batch || !batch.product.active) {
    notFound();
  }

  // Fetch token scan info if provided
  let scanInfo: {
    scanCount: number;
    printedAt: Date;
    lastScannedAt: Date | null;
    isFirstScan: boolean;
  } | null = null;

  if (tokenCode) {
    const token = await prisma.qRToken.findUnique({
      where: { token: tokenCode, status: 'ACTIVE' },
      select: { scanCount: true, printedAt: true, lastScannedAt: true }
    });
    if (token) {
      scanInfo = {
        ...token,
        isFirstScan: token.scanCount === 1
      };
    }
  }

  // Determine if batch is within shelf life
  const isExpired = batch.expirationDate ? new Date(batch.expirationDate) < new Date() : false;
  const qcPassed = batch.qcStatus === 'PASSED';

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {/* Header */}
      <header className={`${isExpired ? 'bg-amber-600' : 'bg-green-600'} text-white`}>
        <div className="max-w-2xl mx-auto px-6 py-6">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              {isExpired ? (
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div>
              <p className={`${isExpired ? 'text-amber-100' : 'text-green-100'} text-sm font-medium`}>
                Batch Verification
              </p>
              <h1 className="text-2xl font-bold">
                {isExpired ? 'Product Expired' : 'Verified Authentic'}
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* First Scan Celebration */}
        {scanInfo?.isFirstScan && !isExpired && (
          <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-xl p-4 shadow-lg">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">&#127881;</span>
              <div>
                <p className="font-bold">First Scan!</p>
                <p className="text-sm opacity-90">You&apos;re the first to verify this batch.</p>
              </div>
            </div>
          </div>
        )}

        {/* Expiration Warning */}
        {isExpired && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start space-x-3">
              <svg className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-semibold text-amber-800">This batch has passed its expiration date</p>
                <p className="text-sm text-amber-700 mt-1">
                  Expired on {new Date(batch.expirationDate!).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Product Info Card */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          {batch.product.publicImageUrl && (
            <div className="aspect-video bg-gray-100 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={batch.product.publicImageUrl}
                alt={batch.product.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">{batch.product.name}</h2>
                <p className="text-gray-500 text-sm">Batch: {batch.batchCode}</p>
              </div>
              {qcPassed && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  QC Passed
                </span>
              )}
            </div>

            {batch.product.publicDescription && (
              <p className="text-gray-700 mt-4">{batch.product.publicDescription}</p>
            )}

            <dl className="grid grid-cols-2 gap-4 text-sm mt-4">
              {batch.product.strain && (
                <div>
                  <dt className="text-gray-400 font-medium">Strain</dt>
                  <dd className="text-gray-900 font-semibold">{batch.product.strain.name}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-400 font-medium">SKU</dt>
                <dd className="text-gray-900">{batch.product.sku}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Batch Info Card */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Batch Information
          </h3>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-400">Batch Code</dt>
              <dd className="text-gray-900 font-mono font-semibold">{batch.batchCode}</dd>
            </div>
            {batch.manufactureDate && (
              <div>
                <dt className="text-gray-400">Manufacture Date</dt>
                <dd className="text-gray-900">
                  {new Date(batch.manufactureDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </dd>
              </div>
            )}
            {batch.expirationDate && (
              <div>
                <dt className="text-gray-400">Best By</dt>
                <dd className={`font-semibold ${isExpired ? 'text-amber-600' : 'text-gray-900'}`}>
                  {new Date(batch.expirationDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-gray-400">Quality Status</dt>
              <dd className="flex items-center">
                {qcPassed ? (
                  <>
                    <svg className="w-4 h-4 text-green-500 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-green-700 font-medium">Tested & Approved</span>
                  </>
                ) : (
                  <span className="text-gray-600">Standard</span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        {/* Certificate of Analysis */}
        {batch.coaUrl && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Certificate of Analysis
            </h3>
            <p className="text-gray-600 text-sm mb-4">
              View the lab test results for this batch to verify potency and purity.
            </p>
            <a
              href={batch.coaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              View Lab Results (PDF)
            </a>
          </div>
        )}

        {/* Quality Overview */}
        {(() => {
          const qualityData = batch.qualityData as QualityData | null;
          const hasQualityData = qualityData && (
            qualityData.identityConfirmation ||
            qualityData.safetyScreening ||
            (qualityData.activeComponents && qualityData.activeComponents.length > 0)
          );

          if (!hasQualityData) return null;

          return (
            <div className="bg-white rounded-xl shadow-md p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Quality Overview
              </h3>

              {/* Identity Confirmation */}
              {qualityData.identityConfirmation && (
                Object.values(qualityData.identityConfirmation).some(v => v)
              ) && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center">
                    <svg className="w-4 h-4 mr-1.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Identity Confirmation
                  </h4>
                  <dl className="grid grid-cols-1 gap-2 text-sm">
                    {qualityData.identityConfirmation.species && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Species</dt>
                        <dd className="text-gray-900 font-medium">{qualityData.identityConfirmation.species}</dd>
                      </div>
                    )}
                    {qualityData.identityConfirmation.form && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Form</dt>
                        <dd className="text-gray-900">{qualityData.identityConfirmation.form}</dd>
                      </div>
                    )}
                    {qualityData.identityConfirmation.method && (
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Method</dt>
                        <dd className="text-gray-900">{qualityData.identityConfirmation.method}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Safety Screening */}
              {qualityData.safetyScreening && (
                Object.values(qualityData.safetyScreening).some(v => v)
              ) && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center">
                    <svg className="w-4 h-4 mr-1.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Safety Screening
                  </h4>
                  <dl className="space-y-2 text-sm">
                    {qualityData.safetyScreening.heavyMetals && (
                      <div className="flex justify-between items-center">
                        <dt className="text-gray-500">Heavy Metals</dt>
                        <dd>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SAFETY_STATUS_STYLES[qualityData.safetyScreening.heavyMetals.status]}`}>
                            {SAFETY_STATUS_LABELS[qualityData.safetyScreening.heavyMetals.status]}
                          </span>
                        </dd>
                      </div>
                    )}
                    {qualityData.safetyScreening.microbialScreen && (
                      <div className="flex justify-between items-center">
                        <dt className="text-gray-500">Microbial Screen</dt>
                        <dd>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SAFETY_STATUS_STYLES[qualityData.safetyScreening.microbialScreen.status]}`}>
                            {SAFETY_STATUS_LABELS[qualityData.safetyScreening.microbialScreen.status]}
                          </span>
                        </dd>
                      </div>
                    )}
                    {qualityData.safetyScreening.visualInspection && (
                      <div className="flex justify-between items-center">
                        <dt className="text-gray-500">Visual Inspection</dt>
                        <dd>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SAFETY_STATUS_STYLES[qualityData.safetyScreening.visualInspection.status]}`}>
                            {SAFETY_STATUS_LABELS[qualityData.safetyScreening.visualInspection.status]}
                          </span>
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Active Components */}
              {qualityData.activeComponents && qualityData.activeComponents.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center">
                    <svg className="w-4 h-4 mr-1.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Active Components
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {qualityData.activeComponents.map((component, index) => (
                      <div
                        key={index}
                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${COMPONENT_LEVEL_STYLES[component.level]}`}
                      >
                        <span className="font-medium">{component.name}</span>
                        <span className="mx-1.5 text-gray-300">|</span>
                        <span className="text-xs">{COMPONENT_LEVEL_LABELS[component.level]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 italic">
                  {qualityData.disclaimer || DEFAULT_QUALITY_DISCLAIMER}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Verification Details */}
        {scanInfo && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Verification Details
            </h3>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-400">Scan Number</dt>
                <dd className="text-gray-900 font-semibold text-lg">#{scanInfo.scanCount}</dd>
              </div>
              <div>
                <dt className="text-gray-400">Label Printed</dt>
                <dd className="text-gray-900">
                  {new Date(scanInfo.printedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </dd>
              </div>
              {scanInfo.lastScannedAt && !scanInfo.isFirstScan && (
                <div className="col-span-2">
                  <dt className="text-gray-400">Last Verified</dt>
                  <dd className="text-gray-900">
                    {new Date(scanInfo.lastScannedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Storage Instructions */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Storage & Handling
          </h3>
          <ul className="space-y-3 text-sm text-gray-700">
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center mr-3 mt-0.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span>Store in a cool, dry place (60-70°F / 15-21°C)</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center mr-3 mt-0.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span>Keep away from direct sunlight and moisture</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center mr-3 mt-0.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span>Keep out of reach of children and pets</span>
            </li>
          </ul>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/"
            className="flex-1 inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-base font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            Visit Website
          </Link>
          <Link
            href="mailto:support@example.com"
            className="flex-1 inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 transition-colors"
          >
            Contact Support
          </Link>
        </div>

        {/* Report Issue Link */}
        <div className="text-center">
          <Link
            href="mailto:support@example.com?subject=Product%20Issue%20Report"
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Report an issue with this product
          </Link>
        </div>

        {/* Trust Badge */}
        <div className="text-center pt-4">
          <div className="inline-flex items-center space-x-2 text-gray-400 text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>Secured by PsillyOps Verification</span>
          </div>
        </div>
      </main>
    </div>
  );
}

export async function generateMetadata({ params }: Props) {
  const { batchId } = await params;
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      product: { select: { name: true } }
    }
  });

  return {
    title: batch ? `Verify: ${batch.product.name} - ${batch.batchCode}` : 'Batch Verification',
    description: 'Verify the authenticity of your product batch',
    robots: 'noindex, nofollow', // Don't index public verification pages
  };
}
