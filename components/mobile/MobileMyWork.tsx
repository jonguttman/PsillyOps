'use client';

/**
 * MobileMyWork Component
 * 
 * Mobile-first "My Work" screen showing:
 * - Assigned production steps
 * - In-progress runs
 * - Blocked steps needing action
 * 
 * This is a daily checklist, not a dashboard.
 * Does NOT show: Completed work, History, Analytics
 */

import React from 'react';
import { useRouter } from 'next/navigation';
import { Play, Clock, AlertTriangle, ChevronRight, Package, CheckCircle2 } from 'lucide-react';
import { GlassCard, CeramicCard, PillButton } from '@/components/mobile';

// Analytics hook placeholder
function trackEvent(event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics]', event, data);
  }
}

export interface WorkItem {
  id: string;
  type: 'PRODUCTION_RUN' | 'STEP';
  status: 'PENDING' | 'IN_PROGRESS' | 'BLOCKED';
  title: string;
  subtitle: string;
  productName: string;
  quantity: number;
  priority?: 'HIGH' | 'NORMAL' | 'LOW';
  blockedReason?: string;
  stepInfo?: {
    stepId: string;
    stepLabel: string;
    stepOrder: number;
    totalSteps: number;
  };
  runId: string;
}

export interface MobileMyWorkData {
  inProgress: WorkItem[];
  pending: WorkItem[];
  blocked: WorkItem[];
}

interface MobileMyWorkProps {
  data: MobileMyWorkData;
}

export function MobileMyWork({ data }: MobileMyWorkProps) {
  const router = useRouter();
  const { inProgress, pending, blocked } = data;

  const handleItemClick = (item: WorkItem) => {
    trackEvent('work_item_clicked', { 
      type: item.type, 
      status: item.status,
      runId: item.runId 
    });
    router.push(`/ops/production-runs/${item.runId}`);
  };

  const isEmpty = inProgress.length === 0 && pending.length === 0 && blocked.length === 0;

  if (isEmpty) {
    return (
      <div className="space-y-4">
        <GlassCard className="!py-12">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-lg font-semibold text-gray-900">All caught up!</p>
            <p className="text-sm text-gray-500 mt-1">
              No pending work assigned to you
            </p>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Blocked items - show first with warning */}
      {blocked.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-gray-900">Needs Attention</h2>
            <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
              {blocked.length}
            </span>
          </div>
          <div className="space-y-2">
            {blocked.map((item) => (
              <WorkItemCard 
                key={item.id} 
                item={item} 
                onClick={() => handleItemClick(item)}
                variant="warning"
              />
            ))}
          </div>
        </section>
      )}

      {/* In Progress - active work */}
      {inProgress.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Play className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-900">In Progress</h2>
            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
              {inProgress.length}
            </span>
          </div>
          <div className="space-y-2">
            {inProgress.map((item) => (
              <WorkItemCard 
                key={item.id} 
                item={item} 
                onClick={() => handleItemClick(item)}
                variant="active"
              />
            ))}
          </div>
        </section>
      )}

      {/* Pending - ready to start */}
      {pending.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">Ready to Start</h2>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {pending.length}
            </span>
          </div>
          <div className="space-y-2">
            {pending.map((item) => (
              <WorkItemCard 
                key={item.id} 
                item={item} 
                onClick={() => handleItemClick(item)}
                variant="default"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

interface WorkItemCardProps {
  item: WorkItem;
  onClick: () => void;
  variant: 'default' | 'active' | 'warning';
}

function WorkItemCard({ item, onClick, variant }: WorkItemCardProps) {
  const CardComponent = variant === 'warning' ? CeramicCard : GlassCard;
  
  return (
    <CardComponent
      variant={variant === 'warning' ? 'warning' : undefined}
      className="!p-0 overflow-hidden"
    >
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        {/* Icon */}
        <div className={`
          w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
          ${variant === 'warning' ? 'bg-amber-100' : variant === 'active' ? 'bg-blue-100' : 'bg-gray-100'}
        `}>
          <Package className={`
            w-5 h-5
            ${variant === 'warning' ? 'text-amber-600' : variant === 'active' ? 'text-blue-600' : 'text-gray-500'}
          `} />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
            {item.priority === 'HIGH' && (
              <span className="text-xs text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                High
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
          
          {/* Step progress */}
          {item.stepInfo && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${variant === 'active' ? 'bg-blue-500' : 'bg-gray-400'}`}
                  style={{ width: `${(item.stepInfo.stepOrder / item.stepInfo.totalSteps) * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-400">
                {item.stepInfo.stepOrder}/{item.stepInfo.totalSteps}
              </span>
            </div>
          )}
          
          {/* Blocked reason */}
          {item.blockedReason && (
            <p className="text-xs text-amber-700 mt-1 truncate">
              {item.blockedReason}
            </p>
          )}
        </div>
        
        {/* Arrow */}
        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
      </button>
    </CardComponent>
  );
}

export default MobileMyWork;

