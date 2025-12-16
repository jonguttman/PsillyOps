'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  QrCode,
  Printer,
  SlidersHorizontal,
  Link2,
  ShoppingCart,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { ActivityEntity } from '@prisma/client';
import ActivityLogDetail from '@/components/activity/ActivityLogDetail';

type ActivityEntityLike = ActivityEntity | 'PRODUCTION_RUN';

export interface ActivityLogItem {
  id: string;
  entityType: ActivityEntityLike;
  entityId: string;
  action: string;
  summary: string;
  diff: Record<string, [unknown, unknown]> | null;
  details: Record<string, unknown> | null;
  tags: string[] | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
}

interface ActivityLogRowProps {
  activity: ActivityLogItem;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getEntityDeepLink(activity: ActivityLogItem): { href: string; label: string } | null {
  // Prefer explicit tokenId from details (QR scans / revokes / etc)
  const details = activity.metadata;
  const tokenIdDirect = details && typeof details['tokenId'] === 'string' ? details['tokenId'] : undefined;
  const tokenObj = details && typeof details['token'] === 'object' && details['token'] ? details['token'] : null;
  const tokenIdNested =
    tokenObj && typeof (tokenObj as Record<string, unknown>)['id'] === 'string'
      ? ((tokenObj as Record<string, unknown>)['id'] as string)
      : undefined;

  const tokenId = tokenIdDirect || tokenIdNested;
  if (tokenId && tokenId.length > 0) {
    const href = tokenId.startsWith('qr_') ? `/qr/${tokenId}` : `/qr-tokens/${tokenId}`;
    return { href, label: 'QR token' };
  }

  switch (activity.entityType) {
    case ActivityEntity.PRODUCT:
      return { href: `/products/${activity.entityId}`, label: 'Product' };
    case ActivityEntity.BATCH:
      return { href: `/batches/${activity.entityId}`, label: 'Batch' };
    case ActivityEntity.INVENTORY:
      return { href: `/inventory/${activity.entityId}`, label: 'Inventory' };
    case ActivityEntity.PURCHASE_ORDER:
      return { href: `/purchase-orders/${activity.entityId}`, label: 'Purchase Order' };
    case ActivityEntity.ORDER:
      return { href: `/orders/${activity.entityId}`, label: 'Order' };
    case ActivityEntity.PRODUCTION_ORDER:
      return { href: `/production-orders/${activity.entityId}`, label: 'Production Order' };
    case 'PRODUCTION_RUN':
      return { href: `/production-runs/${activity.entityId}`, label: 'Production Run' };
    case ActivityEntity.MATERIAL:
      return { href: `/materials/${activity.entityId}`, label: 'Material' };
    default:
      return null;
  }
}

function getEntityLabel(entityType: ActivityEntityLike): string {
  const labels: Record<string, string> = {
    PRODUCT: 'Product',
    MATERIAL: 'Material',
    BATCH: 'Batch',
    INVENTORY: 'Inventory',
    ORDER: 'Order',
    PURCHASE_ORDER: 'PO',
    PRODUCTION_ORDER: 'Production',
    PRODUCTION_RUN: 'Production Run',
    VENDOR: 'Vendor',
    INVOICE: 'Invoice',
    LABEL: 'Label',
    WORK_CENTER: 'Work Center',
    SYSTEM: 'System',
  };
  return labels[entityType] || entityType;
}

function getEntityBadgeColor(entityType: ActivityEntityLike): string {
  const colors: Record<string, string> = {
    PRODUCT: 'bg-blue-100 text-blue-700',
    MATERIAL: 'bg-amber-100 text-amber-700',
    BATCH: 'bg-purple-100 text-purple-700',
    INVENTORY: 'bg-green-100 text-green-700',
    ORDER: 'bg-pink-100 text-pink-700',
    PURCHASE_ORDER: 'bg-cyan-100 text-cyan-700',
    PRODUCTION_ORDER: 'bg-orange-100 text-orange-700',
    PRODUCTION_RUN: 'bg-indigo-100 text-indigo-700',
    VENDOR: 'bg-slate-100 text-slate-700',
    SYSTEM: 'bg-gray-100 text-gray-600',
  };
  return colors[entityType] || 'bg-gray-100 text-gray-600';
}

function getCategory(activity: ActivityLogItem):
  | 'scan'
  | 'print'
  | 'adjustment'
  | 'redirect'
  | 'purchase'
  | 'ai'
  | 'status_change'
  | null {
  const tags = Array.isArray(activity.tags) ? activity.tags : [];
  const action = (activity.action || '').toLowerCase();

  if (tags.includes('ai_command') || action.startsWith('ai_')) return 'ai';
  if (tags.includes('scan') || tags.includes('qr_scan') || action.includes('scanned')) return 'scan';
  if (tags.includes('print')) return 'print';
  if (tags.includes('redirect')) return 'redirect';
  if (tags.includes('status_change') || action.includes('status')) return 'status_change';
  if (tags.includes('quantity_change') || action.includes('adjust')) return 'adjustment';
  if (activity.entityType === ActivityEntity.PURCHASE_ORDER) return 'purchase';
  return null;
}

function categoryIcon(cat: ReturnType<typeof getCategory>) {
  switch (cat) {
    case 'scan':
      return QrCode;
    case 'print':
      return Printer;
    case 'adjustment':
      return SlidersHorizontal;
    case 'redirect':
      return Link2;
    case 'purchase':
      return ShoppingCart;
    case 'ai':
      return Sparkles;
    case 'status_change':
      return RefreshCw;
    default:
      return null;
  }
}

export default function ActivityLogRow({ activity }: ActivityLogRowProps) {
  const [expanded, setExpanded] = useState(false);
  
  const tags = Array.isArray(activity.tags) ? activity.tags : [];
  const isAiCommand = tags.includes('ai_command');
  const isSystem = !activity.user;
  const userName = activity.user?.name || 'System';
  const hasDiff = activity.diff && Object.keys(activity.diff).length > 0;
  const hasDetails = activity.metadata && Object.keys(activity.metadata).length > 0;
  const hasExpandableContent = hasDiff || hasDetails || isAiCommand;
  const deepLink = getEntityDeepLink(activity);
  const cat = getCategory(activity);
  const CatIcon = categoryIcon(cat);
  const exact = formatTimestamp(new Date(activity.createdAt));
  const isInventoryAdjusted = activity.action === 'inventory_adjusted';
  const details = activity.metadata;
  const deltaQty =
    details && typeof details['deltaQty'] === 'number'
      ? details['deltaQty']
      : details && typeof details['deltaQuantity'] === 'number'
        ? details['deltaQuantity']
        : undefined;
  const reason =
    details && typeof details['reason'] === 'string' ? details['reason'] : undefined;

  return (
    <div className="relative">
      {/* timeline dot */}
      <div
        className={`absolute left-3 top-5 h-2 w-2 rounded-full ring-2 ring-white ${
          isAiCommand ? 'bg-blue-500' : isSystem ? 'bg-gray-400' : 'bg-emerald-500'
        }`}
      />

      {/* Main Row */}
      <div
        className={`flex items-start gap-3 py-2 pl-10 pr-2 rounded-md ${
          hasExpandableContent ? 'cursor-pointer hover:bg-gray-50' : ''
        }`}
        onClick={() => hasExpandableContent && setExpanded(!expanded)}
      >
        {/* Expand indicator */}
        <div className="w-4 h-4 flex-shrink-0 mt-0.5">
          {hasExpandableContent && (
            expanded ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )
          )}
        </div>

        {/* Avatar */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
            isSystem
              ? 'bg-gray-200 text-gray-600'
              : isAiCommand
              ? 'bg-blue-100 text-blue-700'
              : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {isSystem ? 'S' : userName.charAt(0).toUpperCase()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            {CatIcon && (
              <div className="mt-0.5 text-gray-400">
                <CatIcon className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm text-gray-900 leading-snug">
                {activity.summary}
              </p>
              {isInventoryAdjusted && typeof deltaQty === 'number' && (
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      deltaQty >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {deltaQty >= 0 ? '+' : ''}
                    {deltaQty}
                  </span>
                  {reason && (
                    <span className="text-xs text-gray-600 truncate">
                      {reason}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Entity link */}
          {deepLink && (
            <div className="mt-1">
              <Link
                href={deepLink.href}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-blue-700 hover:text-blue-800 hover:underline"
                title={activity.entityId}
              >
                {deepLink.label} • {activity.entityId.slice(0, 10)}
                {activity.entityId.length > 10 ? '…' : ''}
              </Link>
            </div>
          )}

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Entity badge */}
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${getEntityBadgeColor(
                activity.entityType
              )}`}
            >
              {getEntityLabel(activity.entityType)}
            </span>
            
            {/* AI tag */}
            {isAiCommand && (
              <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                AI
              </span>
            )}
            
            {/* Risk/shortage tag */}
            {tags.includes('shortage') && (
              <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">
                Shortage
              </span>
            )}
            
            {/* Timestamp */}
            <time className="text-xs text-gray-500" title={exact}>
              {formatTimeAgo(new Date(activity.createdAt))}
            </time>
          </div>
        </div>

        {/* Entity Link */}
        {deepLink && (
          <Link
            href={deepLink.href}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0 p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title={`Open ${deepLink.label}`}
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
        )}
      </div>

      {/* Expanded Content */}
      {expanded && hasExpandableContent && (
        <ActivityLogDetail activity={activity} />
      )}
    </div>
  );
}

