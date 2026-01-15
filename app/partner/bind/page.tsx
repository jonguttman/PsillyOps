/**
 * Partner Bind Page
 * 
 * Phase 2C: Mobile Batch Binding Mode
 * 
 * This page provides the full mobile-first batch binding workflow:
 * 1. Select a product
 * 2. Start a time-bounded session (5 minutes)
 * 3. Scan seals rapidly with haptic/audio feedback
 * 4. Handle rebinds with confirmation modal
 * 5. View session summary on completion
 * 
 * INVARIANTS:
 * - Only ONE active session per partner
 * - already_bound is a no-op (success haptic, no new binding, no scanCount increment)
 * - Rebinding requires explicit confirmation
 * - All batch bindings reference a BindingSession
 */

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { isPartnerUser, canBindSeals } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';
import { listPartnerProducts } from '@/lib/services/partnerProductService';
import { getActiveSession } from '@/lib/services/bindingSessionService';
import { BindClient } from './BindClient';

export default async function PartnerBindPage() {
  const session = await auth();
  
  if (!session?.user || !isPartnerUser(session.user.role as UserRole)) {
    redirect('/partner/login');
  }

  if (!canBindSeals(session.user.role as UserRole)) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-800">
          You do not have permission to bind seals.
        </p>
      </div>
    );
  }

  if (!session.user.partnerId) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-800">
          You are not assigned to a partner.
        </p>
      </div>
    );
  }

  // Fetch products and active session in parallel
  const [products, activeSession] = await Promise.all([
    listPartnerProducts(session.user.partnerId),
    getActiveSession(session.user.partnerId),
  ]);

  return (
    <BindClient
      products={products.map(p => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
      }))}
      initialSession={activeSession ? {
        id: activeSession.id,
        partnerId: activeSession.partnerId,
        partnerProductId: activeSession.partnerProductId,
        startedAt: activeSession.startedAt.toISOString(),
        expiresAt: activeSession.expiresAt.toISOString(),
        status: activeSession.status,
        scanCount: activeSession.scanCount,
        partnerProduct: activeSession.partnerProduct,
      } : null}
    />
  );
}
