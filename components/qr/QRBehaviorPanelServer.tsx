// Server component wrapper to fetch data for QRBehaviorPanel
// This is a Server Component (no 'use client' directive)

import { QRBehaviorPanel } from './QRBehaviorPanel';
import { getActiveRuleForEntity, countTokensForEntity } from '@/lib/services/qrRedirectService';

export async function QRBehaviorPanelServer({
  entityType,
  entityId,
  entityName,
  isAdmin
}: {
  entityType: 'PRODUCT' | 'BATCH' | 'INVENTORY';
  entityId: string;
  entityName: string;
  isAdmin: boolean;
}) {
  const [activeRule, tokenCount] = await Promise.all([
    getActiveRuleForEntity(entityType, entityId),
    countTokensForEntity(entityType, entityId)
  ]);

  const ruleData = activeRule ? {
    id: activeRule.id,
    redirectUrl: activeRule.redirectUrl,
    reason: activeRule.reason,
    startsAt: activeRule.startsAt?.toISOString() || null,
    endsAt: activeRule.endsAt?.toISOString() || null
  } : null;

  return (
    <QRBehaviorPanel
      entityType={entityType}
      entityId={entityId}
      entityName={entityName}
      activeRule={ruleData}
      tokenCount={tokenCount}
      isAdmin={isAdmin}
    />
  );
}

