import { prisma } from '@/lib/db/prisma';
import { notFound } from 'next/navigation';
import type { QualityData } from '@/lib/types/qualityData';
import {
  DEFAULT_QUALITY_DISCLAIMER,
  SAFETY_STATUS_LABELS,
} from '@/lib/types/qualityData';
import { Crimson_Pro, DM_Sans } from 'next/font/google';
import FeedbackForm from '@/components/qr/FeedbackForm';

// Load fonts
const crimsonPro = Crimson_Pro({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-crimson',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans',
});

interface Props {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ t?: string }>;
}

/**
 * Extract display-friendly batch code (remove last counter suffix)
 * Example: "1015204000052-2026-01-16-04" -> "1015204000052-2026-01-16"
 */
function getDisplayBatchCode(fullBatchCode: string): string {
  const lastDashIndex = fullBatchCode.lastIndexOf('-');
  if (lastDashIndex === -1) return fullBatchCode;
  
  // Check if the last segment is just digits (the counter we want to remove)
  const lastSegment = fullBatchCode.substring(lastDashIndex + 1);
  if (/^\d+$/.test(lastSegment)) {
    return fullBatchCode.substring(0, lastDashIndex);
  }
  
  return fullBatchCode;
}

// Safety status styles for the new design
const SAFETY_BADGE_STYLES: Record<string, string> = {
  passed: 'bg-gradient-to-r from-[#d4f4dd] to-[#c8edd4] text-[#2d5f3f]',
  within_limits: 'bg-gradient-to-r from-[#d4f4dd] to-[#c8edd4] text-[#2d5f3f]',
  no_pathogens: 'bg-gradient-to-r from-[#d4f4dd] to-[#c8edd4] text-[#2d5f3f]',
  pending: 'bg-[#fef9f0] text-[#b8860b]',
  not_tested: 'bg-[#f5f5f5] text-[#666666]',
};

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
  const qualityData = batch.qualityData as QualityData | null;
  const hasQualityData = qualityData && (
    qualityData.identityConfirmation ||
    qualityData.safetyScreening ||
    (qualityData.activeComponents && qualityData.activeComponents.length > 0)
  );

  // Current verification timestamp
  const verifiedAt = new Date();

  // Cast product to include optional new fields (they may not exist in DB yet)
  const product = batch.product as typeof batch.product & {
    publicWhyChoose?: string | null;
    publicSuggestedUse?: string | null;
  };

  return (
    <div className={`${crimsonPro.variable} ${dmSans.variable} min-h-screen pb-8`} style={{ 
      fontFamily: 'var(--font-dm-sans), -apple-system, sans-serif',
      background: '#fdfbf7'
    }}>
      {/* Inline styles for animations and rich text content */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { transform: scale(0); }
          to { transform: scale(1); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.6s ease-out both;
        }
        .animate-scaleIn {
          animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .delay-1 { animation-delay: 0.1s; }
        .delay-2 { animation-delay: 0.2s; }
        .delay-3 { animation-delay: 0.3s; }
        .delay-4 { animation-delay: 0.4s; }
        .delay-5 { animation-delay: 0.5s; }

        /* Rich text content styling */
        .prose p { margin: 0 0 0.5em 0; }
        .prose p:last-child { margin-bottom: 0; }
        .prose strong { font-weight: 600; }
        .prose em { font-style: italic; }
        .prose u { text-decoration: underline; }
        .prose ul { list-style-type: disc; padding-left: 1.25em; margin: 0.5em 0; }
        .prose ul:last-child { margin-bottom: 0; }
        .prose li { margin: 0.25em 0; }
      `}} />

      {/* Header */}
      <header 
        className="text-white shadow-md"
        style={{ 
          background: isExpired 
            ? 'linear-gradient(135deg, #b45309 0%, #d97706 100%)' 
            : 'linear-gradient(135deg, #2d5f3f 0%, #4a7d5e 100%)',
          boxShadow: isExpired 
            ? '0 2px 8px rgba(180, 83, 9, 0.15)'
            : '0 2px 8px rgba(45, 95, 63, 0.15)'
        }}
      >
        <div className="max-w-[640px] mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-2xl">🍄</span>
          <h1 
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: 'var(--font-crimson), serif', letterSpacing: '0.01em' }}
          >
            Product Verification
          </h1>
        </div>
      </header>

      <div className="max-w-[640px] mx-auto px-4">
        {/* Verification Status - Subtle confirmation */}
        {!isExpired && (
          <div
            className="flex items-center gap-3 my-5 px-4 py-3 rounded-xl animate-fadeIn"
            style={{
              background: 'linear-gradient(135deg, #d4f4dd 0%, #c8edd4 100%)',
              border: '1px solid #a8d5b1'
            }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 animate-scaleIn"
              style={{ background: '#2d5f3f' }}
            >
              <svg className="w-4 h-4" style={{ stroke: 'white' }} fill="none" viewBox="0 0 24 24" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: '#1a5c2e' }}>
                This product has been verified against our official records
              </p>
            </div>
            {scanInfo?.isFirstScan && (
              <span
                className="px-2 py-1 rounded-full text-xs font-semibold"
                style={{ background: '#fef9f0', color: '#b8860b', border: '1px solid #d4af37' }}
              >
                First Scan!
              </span>
            )}
          </div>
        )}

        {/* Expiration Warning */}
        {isExpired && (
          <div 
            className="rounded-lg p-4 mb-4 animate-fadeIn"
            style={{ 
              background: 'linear-gradient(135deg, #fef9f0 0%, #fcf6ec 100%)',
              borderLeft: '4px solid #d97706'
            }}
          >
            <p className="font-semibold" style={{ color: '#92400e' }}>
              Expired on {new Date(batch.expirationDate!).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
            <p className="text-sm mt-1" style={{ color: '#b45309' }}>
              Please check the product packaging for current information or contact support.
            </p>
          </div>
        )}

        {/* Product Information Card */}
        <div 
          className="bg-white rounded-2xl p-6 mb-4 animate-fadeIn delay-1"
          style={{ 
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e8e3d9'
          }}
        >
          <h2 
            className="text-xl font-bold mb-5 flex items-center gap-2"
            style={{ fontFamily: 'var(--font-crimson), serif', color: '#1a1a1a' }}
          >
            <span 
              className="w-1 h-6 rounded-sm"
              style={{ background: 'linear-gradient(180deg, #d4af37 0%, #2d5f3f 100%)' }}
            />
            Product Information
          </h2>

          {/* Product Name */}
          <h3 
            className="text-2xl font-bold mb-4"
            style={{ fontFamily: 'var(--font-crimson), serif', color: '#2d5f3f' }}
          >
            {product.name}
          </h3>

          {/* Product Image - 16:9 aspect ratio */}
          {product.publicImageUrl && (
            <div 
              className="relative w-full mb-4 rounded-xl overflow-hidden"
              style={{ aspectRatio: '16/9', background: '#f5f5f5' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={product.publicImageUrl}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Product Description */}
          {product.publicDescription && (
            <div
              className="text-sm leading-relaxed mb-4 prose prose-sm max-w-none"
              style={{ color: '#666666' }}
              dangerouslySetInnerHTML={{ __html: product.publicDescription }}
            />
          )}

          {/* Why People Choose This - Teal accent on cream */}
          {product.publicWhyChoose && (
            <div
              className="rounded-lg p-4 mb-4"
              style={{
                background: 'linear-gradient(135deg, #fef9f0 0%, #fcf6ec 100%)',
                borderLeft: '4px solid #00838f'
              }}
            >
              <h2
                className="text-xl font-bold mb-3 flex items-center gap-2"
                style={{ fontFamily: 'var(--font-crimson), serif', color: '#1a1a1a' }}
              >
                <span
                  className="w-1 h-6 rounded-sm"
                  style={{ background: '#00838f' }}
                />
                Why People Choose This
              </h2>
              <div
                className="text-base leading-relaxed prose max-w-none"
                style={{ color: '#666666' }}
                dangerouslySetInnerHTML={{ __html: product.publicWhyChoose }}
              />
            </div>
          )}

          {/* Suggested Use - Purple accent on cream */}
          {product.publicSuggestedUse && (
            <div
              className="rounded-lg p-4 mb-4"
              style={{
                background: 'linear-gradient(135deg, #fef9f0 0%, #fcf6ec 100%)',
                borderLeft: '4px solid #7b1fa2'
              }}
            >
              <h2
                className="text-xl font-bold mb-3 flex items-center gap-2"
                style={{ fontFamily: 'var(--font-crimson), serif', color: '#1a1a1a' }}
              >
                <span
                  className="w-1 h-6 rounded-sm"
                  style={{ background: '#7b1fa2' }}
                />
                Suggested Use
              </h2>
              <div
                className="text-base leading-relaxed prose max-w-none"
                style={{ color: '#666666' }}
                dangerouslySetInnerHTML={{ __html: product.publicSuggestedUse }}
              />
            </div>
          )}

          {/* Batch Number */}
          <div 
            className="rounded-lg p-3 mt-4"
            style={{ background: '#fdfbf7' }}
          >
            <div className="flex justify-between py-1">
              <strong className="text-sm" style={{ color: '#1a1a1a' }}>Batch:</strong>
              <span className="text-sm font-mono" style={{ color: '#666666' }}>{getDisplayBatchCode(batch.batchCode)}</span>
            </div>
          </div>
        </div>

        {/* Quality Overview Card */}
        {hasQualityData && (
          <div 
            className="bg-white rounded-2xl p-6 mb-4 animate-fadeIn delay-2"
            style={{ 
              boxShadow: '0 2px 12px rgba(0, 0, 0, 0.05)',
              border: '1px solid #e8e3d9'
            }}
          >
            <h2 
              className="text-xl font-bold mb-5 flex items-center gap-2"
              style={{ fontFamily: 'var(--font-crimson), serif', color: '#1a1a1a' }}
            >
              <span 
                className="w-1 h-6 rounded-sm"
                style={{ background: 'linear-gradient(180deg, #d4af37 0%, #2d5f3f 100%)' }}
              />
              Quality Overview
            </h2>

            {/* Identity Confirmation */}
            {qualityData?.identityConfirmation && 
              Object.values(qualityData.identityConfirmation).some(v => v) && (
              <div className="mb-5">
                <h3 className="text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: '#666666' }}>
                  <svg className="w-4 h-4" style={{ color: '#2d5f3f' }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Identity Confirmation
                </h3>
                <div className="space-y-2">
                  {qualityData.identityConfirmation.species && (
                    <div className="flex justify-between text-sm py-2" style={{ borderBottom: '1px solid #e8e3d9' }}>
                      <span style={{ color: '#666666' }}>Species</span>
                      <span className="font-medium" style={{ color: '#1a1a1a' }}>{qualityData.identityConfirmation.species}</span>
                    </div>
                  )}
                  {qualityData.identityConfirmation.form && (
                    <div className="flex justify-between text-sm py-2" style={{ borderBottom: '1px solid #e8e3d9' }}>
                      <span style={{ color: '#666666' }}>Form</span>
                      <span style={{ color: '#1a1a1a' }}>{qualityData.identityConfirmation.form}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Safety Screening */}
            {qualityData?.safetyScreening && 
              Object.values(qualityData.safetyScreening).some(v => v) && (
              <div className="mb-5">
                <h3 className="text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: '#666666' }}>
                  <svg className="w-4 h-4" style={{ color: '#2d5f3f' }} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Safety Screening
                </h3>
                <div className="space-y-2">
                  {qualityData.safetyScreening.heavyMetals && (
                    <div className="flex justify-between items-center text-sm py-2" style={{ borderBottom: '1px solid #e8e3d9' }}>
                      <span style={{ color: '#666666' }}>Heavy Metals</span>
                      <span 
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${SAFETY_BADGE_STYLES[qualityData.safetyScreening.heavyMetals.status] || ''}`}
                      >
                        {SAFETY_STATUS_LABELS[qualityData.safetyScreening.heavyMetals.status]}
                      </span>
                    </div>
                  )}
                  {qualityData.safetyScreening.microbialScreen && (
                    <div className="flex justify-between items-center text-sm py-2" style={{ borderBottom: '1px solid #e8e3d9' }}>
                      <span style={{ color: '#666666' }}>Microbial Screen</span>
                      <span 
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${SAFETY_BADGE_STYLES[qualityData.safetyScreening.microbialScreen.status] || ''}`}
                      >
                        {SAFETY_STATUS_LABELS[qualityData.safetyScreening.microbialScreen.status]}
                      </span>
                    </div>
                  )}
                  {qualityData.safetyScreening.visualInspection && (
                    <div className="flex justify-between items-center text-sm py-2">
                      <span style={{ color: '#666666' }}>Visual Inspection</span>
                      <span 
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${SAFETY_BADGE_STYLES[qualityData.safetyScreening.visualInspection.status] || ''}`}
                      >
                        {SAFETY_STATUS_LABELS[qualityData.safetyScreening.visualInspection.status]}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="pt-4" style={{ borderTop: '1px solid #e8e3d9' }}>
              <p className="text-xs italic" style={{ color: '#999999' }}>
                {qualityData?.disclaimer || DEFAULT_QUALITY_DISCLAIMER}
              </p>
            </div>
          </div>
        )}

        {/* Verification Details Card */}
        {scanInfo && (
          <div 
            className="bg-white rounded-2xl p-6 mb-4 animate-fadeIn delay-3"
            style={{ 
              boxShadow: '0 2px 12px rgba(0, 0, 0, 0.05)',
              border: '1px solid #e8e3d9'
            }}
          >
            <h2 
              className="text-xl font-bold mb-5 flex items-center gap-2"
              style={{ fontFamily: 'var(--font-crimson), serif', color: '#1a1a1a' }}
            >
              <span 
                className="w-1 h-6 rounded-sm"
                style={{ background: 'linear-gradient(180deg, #d4af37 0%, #2d5f3f 100%)' }}
              />
              Verification Details
            </h2>

            <div className="space-y-0">
              <div className="flex justify-between items-center py-3" style={{ borderBottom: '1px solid #e8e3d9' }}>
                <span className="text-sm font-medium uppercase tracking-wider" style={{ color: '#666666', letterSpacing: '0.05em' }}>
                  Status
                </span>
                <span 
                  className="inline-block px-3 py-1 rounded-full text-sm font-semibold"
                  style={{ 
                    background: 'linear-gradient(135deg, #d4f4dd 0%, #c8edd4 100%)',
                    color: '#2d5f3f'
                  }}
                >
                  Verified
                </span>
              </div>

              <div className="flex justify-between items-baseline py-3" style={{ borderBottom: '1px solid #e8e3d9' }}>
                <span className="text-sm font-medium uppercase tracking-wider" style={{ color: '#666666', letterSpacing: '0.05em' }}>
                  Verified On
                </span>
                <span className="font-semibold text-right" style={{ color: '#1a1a1a' }}>
                  {verifiedAt.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })} at {verifiedAt.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZoneName: 'short'
                  })}
                </span>
              </div>

              <div className="flex justify-between items-baseline py-3" style={{ borderBottom: '1px solid #e8e3d9' }}>
                <span className="text-sm font-medium uppercase tracking-wider" style={{ color: '#666666', letterSpacing: '0.05em' }}>
                  Total Scans
                </span>
                <span className="font-semibold" style={{ color: '#1a1a1a' }}>
                  {scanInfo.scanCount}
                </span>
              </div>

              <div className="flex justify-between items-baseline py-3">
                <span className="text-sm font-medium uppercase tracking-wider" style={{ color: '#666666', letterSpacing: '0.05em' }}>
                  First Scan
                </span>
                <span className="font-semibold" style={{ color: '#1a1a1a' }}>
                  {new Date(scanInfo.printedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Storage & Handling Card */}
        <div 
          className="bg-white rounded-2xl p-6 mb-4 animate-fadeIn delay-4"
          style={{ 
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e8e3d9'
          }}
        >
          <h2 
            className="text-xl font-bold mb-5 flex items-center gap-2"
            style={{ fontFamily: 'var(--font-crimson), serif', color: '#1a1a1a' }}
          >
            <span 
              className="w-1 h-6 rounded-sm"
              style={{ background: 'linear-gradient(180deg, #d4af37 0%, #2d5f3f 100%)' }}
            />
            Storage & Handling
          </h2>

          <div 
            className="rounded-lg p-4"
            style={{ 
              background: 'linear-gradient(135deg, #fef9f0 0%, #fcf6ec 100%)',
              borderLeft: '4px solid #2d5f3f'
            }}
          >
            <ul className="space-y-2 text-sm" style={{ color: '#666666' }}>
              <li className="flex items-start gap-2">
                <span style={{ color: '#2d5f3f' }}>✓</span>
                <span>Store in a cool, dry place (68-80°F / 20-27°C)</span>
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: '#2d5f3f' }}>✓</span>
                <span>Keep away from direct sunlight and moisture</span>
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: '#2d5f3f' }}>✓</span>
                <span>Keep out of reach of children and pets</span>
              </li>
            </ul>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="space-y-3 mb-6 animate-fadeIn delay-5">
          <a
            href="https://www.originalpsilly.com"
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center py-4 px-6 rounded-xl text-base font-semibold text-white transition-all hover:-translate-y-0.5"
            style={{ 
              background: 'linear-gradient(135deg, #2d5f3f 0%, #4a7d5e 100%)',
              boxShadow: '0 4px 16px rgba(45, 95, 63, 0.25)'
            }}
          >
            Visit Website
          </a>
          
          {batch.coaUrl && (
            <a
              href={batch.coaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-4 px-6 rounded-xl text-base font-semibold transition-all hover:-translate-y-0.5"
              style={{ 
                background: 'white',
                color: '#2d5f3f',
                border: '2px solid #2d5f3f',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)'
              }}
            >
              📊 View Lab Results
            </a>
          )}
        </div>

        {/* Feedback Card */}
        <div
          className="bg-white rounded-2xl p-6 mb-4 animate-fadeIn delay-5"
          style={{
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e8e3d9'
          }}
        >
          <FeedbackForm
            productName={product.name}
            batchCode={getDisplayBatchCode(batch.batchCode)}
            scanCount={scanInfo?.scanCount}
            verificationDate={verifiedAt.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          />
        </div>

        {/* Footer */}
        <footer className="text-center pt-2 pb-4">
          <p className="text-xs" style={{ color: '#999999', opacity: 0.7 }}>
            © {new Date().getFullYear()} Original Psilly. All products tested and verified.
          </p>
        </footer>
      </div>
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
