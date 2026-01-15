import { prisma } from '@/lib/db/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';

interface Props {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ t?: string }>;
}

export default async function ProductAuthenticityPage({ params, searchParams }: Props) {
  const { productId } = await params;
  const { t: tokenCode } = await searchParams;

  // Fetch product with strain info
  const product = await prisma.product.findUnique({
    where: { id: productId, active: true },
    include: {
      strain: {
        select: { id: true, name: true, shortCode: true }
      }
    }
  });

  if (!product) {
    notFound();
  }

  // Fetch token scan info if provided (for verification details)
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {/* Header */}
      <header className="bg-green-600 text-white">
        <div className="max-w-2xl mx-auto px-6 py-6">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-green-100 text-sm font-medium">Product Verification</p>
              <h1 className="text-2xl font-bold">Verified Authentic</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* First Scan Celebration */}
        {scanInfo?.isFirstScan && (
          <div className="bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-xl p-4 shadow-lg">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">&#127881;</span>
              <div>
                <p className="font-bold">First Scan!</p>
                <p className="text-sm opacity-90">You&apos;re the first to verify this product.</p>
              </div>
            </div>
          </div>
        )}

        {/* Product Info Card */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          {/* Product Image (if available) */}
          {product.publicImageUrl && (
            <div className="aspect-video bg-gray-100 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.publicImageUrl}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1">{product.name}</h2>
            <p className="text-gray-500 text-sm mb-4">SKU: {product.sku}</p>

            {product.publicDescription && (
              <p className="text-gray-700 mb-4">{product.publicDescription}</p>
            )}

            <dl className="grid grid-cols-2 gap-4 text-sm">
              {product.strain && (
                <div>
                  <dt className="text-gray-400 font-medium">Strain</dt>
                  <dd className="text-gray-900 font-semibold">{product.strain.name}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-400 font-medium">Unit</dt>
                <dd className="text-gray-900">{product.unitOfMeasure}</dd>
              </div>
            </dl>
          </div>
        </div>

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

        {/* Experience Guide */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Experience Guide
          </h3>
          <ul className="space-y-3 text-sm text-gray-700">
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center mr-3 mt-0.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span>Store in a cool, dry place away from direct sunlight</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center mr-3 mt-0.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span>Keep out of reach of children and pets</span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center mr-3 mt-0.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span>For best results, consume before the expiration date</span>
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
  const { productId } = await params;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true }
  });

  return {
    title: product ? `Verify: ${product.name}` : 'Product Verification',
    description: 'Verify the authenticity of your product',
    robots: 'noindex, nofollow', // Don't index public verification pages
  };
}
