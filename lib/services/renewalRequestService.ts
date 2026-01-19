/**
 * Renewal Request Service
 *
 * Handles creation and tracking of renewal requests from expired catalog landing pages.
 */

import { prisma } from '@/lib/db/prisma';
import { logAction } from './loggingService';
import { ActivityEntity } from '@prisma/client';

// ========================================
// TYPES
// ========================================

export interface CreateRenewalRequestParams {
  name: string;
  store: string;
  emailOrPhone: string;
  note?: string;
  sourceToken: string;
  retailerId?: string;
  retailerName?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RenewalRequestResult {
  id: string;
  requestedAt: Date;
}

// ========================================
// CREATE RENEWAL REQUEST
// ========================================

export async function createRenewalRequest(
  params: CreateRenewalRequestParams
): Promise<RenewalRequestResult> {
  const {
    name,
    store,
    emailOrPhone,
    note,
    sourceToken,
    retailerId,
    retailerName,
    ipAddress,
    userAgent
  } = params;

  // Create the renewal request record
  const request = await prisma.renewalRequest.create({
    data: {
      name,
      store,
      emailOrPhone,
      note,
      sourceToken,
      retailerId,
      entryPoint: 'RETAIL_CATALOG_EXPIRED',
      ipAddress,
      userAgent
    }
  });

  // Log the activity
  await logAction({
    entityType: ActivityEntity.SYSTEM,
    action: 'retailer_intro_renewal_requested',
    ipAddress,
    userAgent,
    summary: `Renewal request from ${name} (${store}) via expired catalog token`,
    metadata: {
      requestId: request.id,
      sourceToken,
      retailerId: retailerId || null,
      retailerName: retailerName || null,
      name,
      store,
      emailOrPhone,
      entryPoint: 'RETAIL_CATALOG_EXPIRED'
    },
    tags: ['retailer', 'portal', 'expired', 'renewal_request']
  });

  return {
    id: request.id,
    requestedAt: request.requestedAt
  };
}
