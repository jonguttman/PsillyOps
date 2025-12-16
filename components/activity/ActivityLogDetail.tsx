'use client';

import Link from 'next/link';
import type { ActivityEntity } from '@prisma/client';
import type { ActivityLogItem } from '@/components/activity/ActivityLogRow';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function getString(obj: Record<string, unknown> | null, key: string): string | undefined {
  if (!obj) return undefined;
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function getRecord(obj: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  if (!obj) return null;
  const v = obj[key];
  return isRecord(v) ? v : null;
}

function formatValue(v: unknown) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '—';
  if (typeof v === 'string') return v.length > 140 ? `${v.slice(0, 140)}…` : v;
  try {
    const json = JSON.stringify(v);
    return json.length > 140 ? `${json.slice(0, 140)}…` : json;
  } catch {
    return String(v);
  }
}

function entityHref(entityType: ActivityEntity, entityId: string) {
  switch (entityType) {
    case 'PRODUCT':
      return `/products/${entityId}`;
    case 'BATCH':
      return `/batches/${entityId}`;
    case 'INVENTORY':
      return `/inventory/${entityId}`;
    case 'PURCHASE_ORDER':
      return `/purchase-orders/${entityId}`;
    case 'ORDER':
      return `/orders/${entityId}`;
    case 'PRODUCTION_ORDER':
      return `/production-orders/${entityId}`;
    case 'PRODUCTION_RUN':
      return `/production-runs/${entityId}`;
    case 'MATERIAL':
      return `/materials/${entityId}`;
    default:
      return null;
  }
}

function extractRelatedLinks(activity: ActivityLogItem) {
  const links: { label: string; href: string }[] = [];
  const details = activity.metadata;

  // relatedEntityType/Id (common for adjustments)
  const relType = getString(details, 'relatedEntityType');
  const relId = getString(details, 'relatedEntityId');
  if (relType && relId) {
    if (relType === 'PRODUCTION_ORDER') links.push({ label: 'Production Order', href: `/production-orders/${relId}` });
    if (relType === 'BATCH') links.push({ label: 'Batch', href: `/batches/${relId}` });
    if (relType === 'INVENTORY') links.push({ label: 'Inventory', href: `/inventory/${relId}` });
    if (relType === 'PURCHASE_ORDER') links.push({ label: 'Purchase Order', href: `/purchase-orders/${relId}` });
    if (relType === 'ORDER') links.push({ label: 'Order', href: `/orders/${relId}` });
    if (relType === 'MATERIAL') links.push({ label: 'Material', href: `/materials/${relId}` });
    if (relType === 'PRODUCT') links.push({ label: 'Product', href: `/products/${relId}` });
  }

  // QR token link (preferred)
  const tokenId = getString(details, 'tokenId') || getString(getRecord(details, 'token'), 'id');
  if (tokenId && tokenId.length > 0) {
    // tokenId in logs is often the internal ID; fall back to ops token page if needed
    const href = tokenId.startsWith('qr_') ? `/qr/${tokenId}` : `/qr-tokens/${tokenId}`;
    links.push({ label: 'QR token', href });
  }

  // If details carries entityType/entityId, link to it (often QR events)
  const embeddedEntityType = getString(details, 'entityType');
  const embeddedEntityId = getString(details, 'entityId');
  if (embeddedEntityType && embeddedEntityId) {
    const href = entityHref(embeddedEntityType as ActivityEntity, embeddedEntityId);
    if (href) links.push({ label: embeddedEntityType, href });
  }

  // Common foreign keys (best-effort)
  const common: Array<{ key: string; entityType: ActivityEntity; label: string }> = [
    { key: 'productId', entityType: 'PRODUCT', label: 'Product' },
    { key: 'batchId', entityType: 'BATCH', label: 'Batch' },
    { key: 'inventoryId', entityType: 'INVENTORY', label: 'Inventory' },
    { key: 'purchaseOrderId', entityType: 'PURCHASE_ORDER', label: 'Purchase Order' },
    { key: 'orderId', entityType: 'ORDER', label: 'Order' },
    { key: 'productionOrderId', entityType: 'PRODUCTION_ORDER', label: 'Production Order' },
    { key: 'productionRunId', entityType: 'PRODUCTION_RUN', label: 'Production Run' },
    { key: 'materialId', entityType: 'MATERIAL', label: 'Material' },
  ];

  for (const c of common) {
    const id = getString(details, c.key);
    if (id && id.length > 0) {
      const href = entityHref(c.entityType, id);
      if (href) links.push({ label: c.label, href });
    }
  }

  // De-dupe
  const uniq = new Map<string, { label: string; href: string }>();
  for (const l of links) uniq.set(l.href, l);
  return Array.from(uniq.values());
}

export default function ActivityLogDetail({ activity }: { activity: ActivityLogItem }) {
  const tags = Array.isArray(activity.tags) ? activity.tags : [];
  const when = new Date(activity.createdAt).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const who = activity.user ? `${activity.user.name} (${activity.user.role})` : 'System';

  const related = extractRelatedLinks(activity);
  const hasDiff = activity.diff && Object.keys(activity.diff).length > 0;
  const details = activity.metadata && Object.keys(activity.metadata).length > 0 ? activity.metadata : null;

  const noteLike: unknown =
    (details ? details['notes'] : undefined) ??
    (details ? details['note'] : undefined) ??
    (details ? details['reason'] : undefined) ??
    (details ? details['message'] : undefined) ??
    (details ? details['error'] : undefined);

  const cmdObj = getRecord(details, 'command');
  const aiCommand: unknown = (cmdObj ? cmdObj['command'] : undefined) ?? (details ? details['commandName'] : undefined);

  return (
    <div className="mt-2 ml-10 mr-2 rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-3">
      <div className="text-xs text-gray-500">
        <span className="font-medium text-gray-700">{who}</span> • <span title={activity.createdAt}>{when}</span>
      </div>

      {/* Narrative diff */}
      {hasDiff && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-600">What changed</div>
          <ul className="space-y-1 text-sm text-gray-800">
            {Object.entries(activity.diff!).slice(0, 12).map(([field, [before, after]]) => (
              <li key={field} className="leading-snug">
                <span className="font-medium">{field}</span>:{' '}
                <span className="text-red-700">{formatValue(before)}</span>
                <span className="text-gray-400"> → </span>
                <span className="text-emerald-700">{formatValue(after)}</span>
              </li>
            ))}
            {Object.keys(activity.diff!).length > 12 && (
              <li className="text-xs text-gray-500">…and more</li>
            )}
          </ul>
        </div>
      )}

      {/* Related entities */}
      {related.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-600">Related</div>
          <div className="flex flex-wrap gap-2">
            {related.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-xs px-2 py-1 rounded-md bg-white border border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Notes / details */}
      {noteLike !== undefined && noteLike !== null ? (
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-600">Notes</div>
          <div className="text-sm text-gray-800 leading-snug">{formatValue(noteLike)}</div>
        </div>
      ) : null}

      {/* AI context */}
      {tags.includes('ai_command') && (
        <div className="rounded-md bg-blue-50 border border-blue-100 p-2">
          <div className="text-xs font-medium text-blue-700">AI context</div>
          <div className="text-sm text-blue-800 mt-1">
            {typeof aiCommand === 'string' && aiCommand.length > 0 ? (
              <>
                Command: <span className="font-medium">{aiCommand}</span>
              </>
            ) : (
              'AI-originated action'
            )}
          </div>
        </div>
      )}
    </div>
  );
}

