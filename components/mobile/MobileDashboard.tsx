'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { 
  AlertTriangle, 
  Factory, 
  QrCode, 
  Plus, 
  Bell,
  FileText,
  CheckCircle,
  Package,
  ChevronRight
} from 'lucide-react';
import { GlassCard } from './GlassCard';
import { CeramicCard } from './CeramicCard';
import { PillButton } from './PillButton';

// Analytics hook placeholder
function trackEvent(event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics]', event, data);
  }
}

interface LowStockMaterial {
  id: string;
  name: string;
  currentStockQty: number;
  reorderPoint: number;
}

interface BlockedOrder {
  id: string;
  orderNumber: string;
  product: { name: string };
}

interface QcHoldBatch {
  id: string;
  batchCode: string;
  product: { name: string };
}

interface Activity {
  id: string;
  action: string;
  summary: string | null;
  createdAt: Date;
  user: { name: string | null } | null;
}

export interface MobileDashboardData {
  lowStockMaterials: LowStockMaterial[];
  blockedOrders: BlockedOrder[];
  qcHoldBatches: QcHoldBatch[];
  activeProductionOrders: number;
  recentActivity: Activity[];
  alertsCount: number;
}

interface MobileDashboardProps {
  data: MobileDashboardData;
}

/**
 * Mobile Dashboard
 * 
 * Structure:
 * 1. Needs Attention (CeramicCard) - only if there are issues
 * 2. Recent Activity (GlassCard)
 * 3. Action Bar (GlassCard)
 * 
 * If there are no issues, the dashboard feels quiet.
 */
export function MobileDashboard({ data }: MobileDashboardProps) {
  const {
    lowStockMaterials,
    blockedOrders,
    qcHoldBatches,
    activeProductionOrders,
    recentActivity,
    alertsCount,
  } = data;

  const hasAttentionItems = 
    lowStockMaterials.length > 0 || 
    blockedOrders.length > 0 || 
    qcHoldBatches.length > 0 ||
    activeProductionOrders === 0;

  return (
    <div className="space-y-4">
      {/* Needs Attention - only show if there are issues */}
      {hasAttentionItems && (
        <CeramicCard>
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Needs Attention</h2>
          <div className="space-y-4">
            {/* Low Stock Materials */}
            {lowStockMaterials.length > 0 && (
              <AttentionItem
                icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
                title={`${lowStockMaterials.length} material${lowStockMaterials.length !== 1 ? 's' : ''} below reorder point`}
                action={
                  <PillButton 
                    variant="glass" 
                    href="/ops/materials"
                    iconRight={<ChevronRight className="w-4 h-4" />}
                    onClick={() => trackEvent('dashboard_action', { action: 'review_materials' })}
                  >
                    Review materials
                  </PillButton>
                }
              />
            )}

            {/* No Active Production */}
            {activeProductionOrders === 0 && (
              <AttentionItem
                icon={<Factory className="w-5 h-5 text-emerald-500" />}
                title="No active production runs"
                action={
                  <PillButton 
                    variant="glass" 
                    href="/ops/production/new"
                    iconRight={<ChevronRight className="w-4 h-4" />}
                    onClick={() => trackEvent('dashboard_action', { action: 'start_production' })}
                  >
                    Start production
                  </PillButton>
                }
              />
            )}

            {/* Blocked Orders */}
            {blockedOrders.length > 0 && (
              <AttentionItem
                icon={<Package className="w-5 h-5 text-red-500" />}
                title={`${blockedOrders.length} production order${blockedOrders.length !== 1 ? 's' : ''} blocked`}
                action={
                  <PillButton 
                    variant="glass" 
                    href="/ops/production"
                    iconRight={<ChevronRight className="w-4 h-4" />}
                    onClick={() => trackEvent('dashboard_action', { action: 'view_blocked' })}
                  >
                    View
                  </PillButton>
                }
              />
            )}

            {/* QC Hold Batches */}
            {qcHoldBatches.length > 0 && (
              <AttentionItem
                icon={<CheckCircle className="w-5 h-5 text-orange-500" />}
                title={`${qcHoldBatches.length} batch${qcHoldBatches.length !== 1 ? 'es' : ''} in QC hold`}
                action={
                  <PillButton 
                    variant="glass" 
                    href="/ops/batches"
                    iconRight={<ChevronRight className="w-4 h-4" />}
                    onClick={() => trackEvent('dashboard_action', { action: 'view_qc_hold' })}
                  >
                    View
                  </PillButton>
                }
              />
            )}
          </div>
        </CeramicCard>
      )}

      {/* Recent Activity */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
          <Link 
            href="/ops/activity" 
            className="text-xs text-blue-600 font-medium"
            onClick={() => trackEvent('dashboard_action', { action: 'view_all_activity' })}
          >
            •••
          </Link>
        </div>
        
        {recentActivity.length > 0 ? (
          <div className="space-y-1">
            {recentActivity.slice(0, 5).map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 py-4 text-center">No recent activity</p>
        )}
      </GlassCard>

      {/* Action Bar */}
      <GlassCard className="!p-3">
        <div className="flex items-center justify-center gap-2">
          <PillButton 
            variant="glass" 
            href="/ops/m/scan"
            icon={<QrCode className="w-4 h-4" />}
            onClick={() => trackEvent('dashboard_action', { action: 'scan_qr' })}
          >
            Scan QR
          </PillButton>
          
          <div className="w-px h-6 bg-gray-200" />
          
          <PillButton 
            variant="glass" 
            href="/ops/production/new"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => trackEvent('dashboard_action', { action: 'new' })}
          >
            New
          </PillButton>
          
          <div className="w-px h-6 bg-gray-200" />
          
          <Link
            href="/ops"
            className="
              inline-flex items-center gap-1.5
              min-h-[44px] px-4
              text-sm font-semibold text-gray-700
              transition-colors duration-[var(--transition-fast)]
              active:text-gray-900
            "
            onClick={() => trackEvent('dashboard_action', { action: 'alerts' })}
          >
            <Bell className="w-4 h-4" />
            <span>Alerts</span>
            {alertsCount > 0 && (
              <span className="
                inline-flex items-center justify-center
                min-w-[20px] h-5 px-1.5
                text-xs font-bold text-white
                bg-amber-500 rounded-full
              ">
                {alertsCount}
              </span>
            )}
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}

// Sub-components

interface AttentionItemProps {
  icon: React.ReactNode;
  title: string;
  action: React.ReactNode;
}

function AttentionItem({ icon, title, action }: AttentionItemProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-3 min-w-0">
        {icon}
        <span className="text-sm text-gray-800 truncate">{title}</span>
      </div>
      {action}
    </div>
  );
}

interface ActivityRowProps {
  activity: Activity;
}

function ActivityRow({ activity }: ActivityRowProps) {
  const getActivityIcon = (action: string) => {
    if (action.includes('print') || action.includes('label')) {
      return <FileText className="w-4 h-4 text-gray-400" />;
    }
    if (action.includes('complete') || action.includes('release')) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
    if (action.includes('create') || action.includes('start')) {
      return <Plus className="w-4 h-4 text-blue-500" />;
    }
    return <FileText className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className="flex items-start gap-3 py-2.5 min-h-[44px]">
      <div className="mt-0.5">
        {getActivityIcon(activity.action)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-900 font-medium leading-tight">
          {activity.summary || activity.action}
        </p>
        {activity.user?.name && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {activity.user.name}
          </p>
        )}
      </div>
      <span className="text-xs text-gray-400 whitespace-nowrap">
        {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: false })}
      </span>
    </div>
  );
}

