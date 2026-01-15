/**
 * TripDAR Public Payload Mapper
 * 
 * Transforms internal Ops data into safe public payloads for Tripd.ar.
 * 
 * CRITICAL SECURITY RULE:
 * - NEVER expose internal IDs (cuid, uuid, etc.)
 * - NEVER expose internal field names that reveal schema
 * - ONLY return human-readable, public-safe fields
 */

import type { 
  TripdarToken, 
  TripdarTokenStatus,
  Product, 
  Partner, 
  Batch,
  PartnerStatus 
} from '@prisma/client';

/**
 * Public-safe lookup response payload
 * 
 * This is the contract between Ops and Tripd.ar.
 * Changes here require coordination with Tripd.ar app.
 */
export interface TripdarLookupPayload {
  status: TripdarTokenStatus;
  verification: {
    authentic: boolean;
    message: string;
  };
  product: {
    name: string;
    sku: string | null;
    batchCode: string | null;
    productionDate: string | null; // ISO date string (YYYY-MM-DD)
  } | null;
  partner: {
    name: string;
    verified: boolean;
  } | null;
  transparency: {
    available: boolean;
    summary: string;
    detailsUrl: string | null;
  };
  survey: {
    enabled: boolean;
    experienceMode: string | null;
    alreadySubmitted: boolean;
  };
}

/**
 * Transform internal Ops data to public-safe payload
 * 
 * @param args - Internal data from Ops database
 * @returns Public-safe payload for Tripd.ar
 */
export function toTripdarLookupPayload(args: {
  token: TripdarToken;
  product?: Product | null;
  partner?: Partner | null;
  batch?: Batch | null;
  alreadySubmitted?: boolean;
}): TripdarLookupPayload {
  const { token, product, partner, batch, alreadySubmitted = false } = args;

  // Derive verification message from status
  const verificationMessage = getVerificationMessage(token.status);
  const isAuthentic = token.status === 'ACTIVE' || token.status === 'UNBOUND';

  // Derive partner verification from status
  const isPartnerVerified = partner?.status === 'ACTIVE';

  // Survey is only enabled for scannable tokens
  const surveyEnabled = token.status === 'ACTIVE' || token.status === 'UNBOUND';

  return {
    status: token.status,
    verification: {
      authentic: isAuthentic,
      message: verificationMessage,
    },
    product: product
      ? {
          name: product.name,
          sku: product.sku ?? null,
          batchCode: batch?.batchCode ?? null,
          productionDate: batch?.productionDate 
            ? batch.productionDate.toISOString().slice(0, 10) 
            : null,
        }
      : null,
    partner: partner
      ? {
          name: partner.name,
          verified: isPartnerVerified,
        }
      : null,
    transparency: {
      // Transparency is available if product is bound
      available: Boolean(product),
      summary: product 
        ? 'Product information available' 
        : 'Unassigned seal',
      detailsUrl: null, // Future: deep link to transparency page
    },
    survey: {
      enabled: surveyEnabled,
      experienceMode: product?.defaultExperienceMode ?? null,
      alreadySubmitted,
    },
  };
}

/**
 * Get human-readable verification message for token status
 */
function getVerificationMessage(status: TripdarTokenStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'Verified TripDAR Participant';
    case 'UNBOUND':
      return 'Valid TripDAR Seal (Unassigned)';
    case 'REVOKED':
      return 'This seal has been revoked';
    case 'EXPIRED':
      return 'This seal has expired';
    default:
      return 'Unknown status';
  }
}

/**
 * Survey submission response payload
 */
export interface TripdarSurveyResponsePayload {
  success: boolean;
  message: string;
  comparison?: {
    totalResponses: number;
    // Future: add aggregate comparison data
  };
}

/**
 * Create survey submission success response
 */
export function toSurveySuccessPayload(totalResponses: number): TripdarSurveyResponsePayload {
  return {
    success: true,
    message: 'Thank you for contributing',
    comparison: {
      totalResponses,
    },
  };
}

/**
 * Create survey submission error response
 */
export function toSurveyErrorPayload(message: string): TripdarSurveyResponsePayload {
  return {
    success: false,
    message,
  };
}

