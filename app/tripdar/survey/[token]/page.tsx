/**
 * TripDAR Experience Survey Page
 * 
 * Separate survey page for experience feedback collection.
 * Accessed from /seal/[token] CTA.
 */

import { notFound, redirect } from 'next/navigation';
import { getTokenByValue } from '@/lib/services/qrTokenService';
import { resolveSealState } from '@/lib/utils/sealState';
import { getActivePredictionsByMode } from '@/lib/services/predictionService';
import { prisma } from '@/lib/db/prisma';
import { TripDARSurveyClient } from './TripDARSurveyClient';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function TripDARSurveyPage({ params }: PageProps) {
  const { token } = await params;

  // Get token record
  const tokenRecord = await getTokenByValue(token);

  if (!tokenRecord) {
    notFound();
  }

  // Check seal state - redirect to seal page if not active
  const sealState = resolveSealState({
    status: tokenRecord.status,
    expiresAt: tokenRecord.expiresAt
  });

  if (sealState !== 'ACTIVE') {
    // Redirect to seal page to show revoked/expired state
    redirect(`/seal/${token}`);
  }

  // Resolve entity to Product
  let productId: string;
  let productName: string | null = null;

  if (tokenRecord.entityType === 'PRODUCT') {
    productId = tokenRecord.entityId;
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { name: true, defaultExperienceMode: true }
    });
    if (product) {
      productName = product.name;
    }
  } else if (tokenRecord.entityType === 'BATCH') {
    const batch = await prisma.batch.findUnique({
      where: { id: tokenRecord.entityId },
      select: { 
        productId: true,
        product: {
          select: { name: true, defaultExperienceMode: true }
        }
      }
    });
    if (!batch) {
      notFound();
    }
    productId = batch.productId;
    productName = batch.product.name;
  } else {
    // Only PRODUCT and BATCH entities support surveys
    redirect(`/seal/${token}`);
  }

  // Get product default mode and active predictions
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { defaultExperienceMode: true }
  });
  const defaultMode = product?.defaultExperienceMode || 'MACRO';
  const activePredictions = await getActivePredictionsByMode(productId);
  const hasMicro = !!activePredictions.MICRO;
  const hasMacro = !!activePredictions.MACRO;

  return (
    <TripDARSurveyClient
      token={token}
      productName={productName || undefined}
      productId={productId}
      defaultMode={defaultMode}
      hasMicro={hasMicro}
      hasMacro={hasMacro}
    />
  );
}

