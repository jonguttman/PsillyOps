'use client';

/**
 * MobileProductionRun Component
 * 
 * Mobile-first production run execution:
 * - One step per screen
 * - Active step = Ceramic
 * - Context = Glass
 * - One primary action per screen
 * 
 * Supports:
 * - Start run
 * - Advance steps
 * - Record quantities
 * - Mark holds
 * - Complete run
 */

import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Play, 
  Check, 
  Pause, 
  AlertTriangle, 
  ChevronRight, 
  ChevronLeft,
  Package,
  Clock,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { GlassCard, CeramicCard, PillButton } from '@/components/mobile';

// Analytics hook placeholder
function trackEvent(event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics]', event, data);
  }
}

export type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
export type RunStatus = 'PLANNED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export interface ProductionStep {
  id: string;
  key: string;
  label: string;
  order: number;
  status: StepStatus;
  notes?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface ProductionRunData {
  id: string;
  status: RunStatus;
  quantity: number;
  actualQuantity?: number;
  product: {
    id: string;
    name: string;
    sku: string;
  };
  steps: ProductionStep[];
  batchCode?: string;
  notes?: string;
  startedAt?: string;
  completedAt?: string;
}

interface MobileProductionRunProps {
  run: ProductionRunData;
  onRefresh?: () => void | Promise<void>;
}

type ViewState = 'overview' | 'step' | 'complete' | 'hold';

export function MobileProductionRun({ run, onRefresh }: MobileProductionRunProps) {
  const router = useRouter();
  
  // Refresh handler
  const handleRefresh = useCallback(async () => {
    if (onRefresh) {
      await onRefresh();
    } else {
      router.refresh();
    }
  }, [onRefresh, router]);
  const [viewState, setViewState] = useState<ViewState>('overview');
  const [activeStepIndex, setActiveStepIndex] = useState(() => {
    const inProgressIdx = run.steps.findIndex(s => s.status === 'IN_PROGRESS');
    if (inProgressIdx >= 0) return inProgressIdx;
    const pendingIdx = run.steps.findIndex(s => s.status === 'PENDING');
    return pendingIdx >= 0 ? pendingIdx : 0;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeStep = run.steps[activeStepIndex];
  const completedSteps = run.steps.filter(s => s.status === 'COMPLETED').length;
  const allStepsComplete = run.steps.every(s => s.status === 'COMPLETED' || s.status === 'SKIPPED');

  // API call helper
  const apiCall = useCallback(async (endpoint: string, body: Record<string, unknown>) => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || 'Operation failed');
      }
      
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Operation failed';
      setError(message);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  // Start the production run (by starting the first step)
  const handleStartRun = useCallback(async () => {
    const firstStep = run.steps.find(s => s.status === 'PENDING');
    if (!firstStep) return;
    
    trackEvent('run_started', { runId: run.id, stepId: firstStep.id });
    
    try {
      await apiCall(`/api/production-runs/steps/${firstStep.id}/start`, {});
      await handleRefresh();
    } catch {
      // Error already set
    }
  }, [run.id, run.steps, apiCall, onRefresh]);

  // Start a step
  const handleStartStep = useCallback(async () => {
    if (!activeStep) return;
    trackEvent('step_started', { runId: run.id, stepId: activeStep.id });
    
    try {
      await apiCall(`/api/production-runs/steps/${activeStep.id}/start`, {});
      await handleRefresh();
    } catch {
      // Error already set
    }
  }, [run.id, activeStep, apiCall, onRefresh]);

  // Complete a step
  const handleCompleteStep = useCallback(async () => {
    if (!activeStep) return;
    trackEvent('step_completed', { runId: run.id, stepId: activeStep.id });
    
    try {
      const data = await apiCall(`/api/production-runs/steps/${activeStep.id}/complete`, {});
      
      // If run was completed, show completion view
      if (data.runCompleted) {
        setViewState('complete');
      } else {
        // Move to next step
        if (activeStepIndex < run.steps.length - 1) {
          setActiveStepIndex(activeStepIndex + 1);
        }
      }
      
      await handleRefresh();
    } catch {
      // Error already set
    }
  }, [run.id, activeStep, activeStepIndex, run.steps.length, apiCall, onRefresh]);

  // Skip a step
  const handleSkipStep = useCallback(async () => {
    if (!activeStep) return;
    trackEvent('step_skipped', { runId: run.id, stepId: activeStep.id });
    
    try {
      await apiCall(`/api/production-runs/steps/${activeStep.id}/skip`, { reason: 'Skipped via mobile' });
      
      // Move to next step or complete view
      if (activeStepIndex < run.steps.length - 1) {
        setActiveStepIndex(activeStepIndex + 1);
      } else {
        setViewState('complete');
      }
      
      await handleRefresh();
    } catch {
      // Error already set
    }
  }, [run.id, activeStep, activeStepIndex, run.steps.length, apiCall, onRefresh]);

  // Put run on hold (not implemented yet - would need a new API)
  const handlePutOnHold = useCallback(async (reason: string) => {
    trackEvent('run_on_hold', { runId: run.id });
    // TODO: Implement hold API endpoint
    setError('Hold functionality not yet implemented');
  }, [run.id]);

  // Complete the run (already handled by completing last step, but show confirmation)
  const handleCompleteRun = useCallback(() => {
    trackEvent('run_completed_confirmed', { runId: run.id });
    router.push('/ops/work');
  }, [run.id, router]);

  // Render overview (run info + step list)
  if (viewState === 'overview') {
    return (
      <div className="space-y-4">
        {/* Run header */}
        <CeramicCard>
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-gray-900 truncate">{run.product.name}</p>
              <p className="text-sm text-gray-500">{run.product.sku}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-sm font-medium text-gray-900">{run.quantity} units</span>
                {run.batchCode && (
                  <span className="text-xs text-gray-500">Batch: {run.batchCode}</span>
                )}
              </div>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Progress</span>
              <span>{completedSteps} of {run.steps.length} steps</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${(completedSteps / run.steps.length) * 100}%` }}
              />
            </div>
          </div>
        </CeramicCard>

        {/* Error display */}
        {error && (
          <CeramicCard variant="warning">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">{error}</p>
            </div>
          </CeramicCard>
        )}

        {/* Run not started */}
        {run.status === 'PLANNED' && (
          <PillButton 
            variant="ceramic" 
            onClick={handleStartRun}
            disabled={isSubmitting}
            icon={<Play className="w-4 h-4" />}
            className="w-full"
          >
            {isSubmitting ? 'Starting...' : 'Start Production Run'}
          </PillButton>
        )}

        {/* Run on hold */}
        {run.status === 'ON_HOLD' && (
          <CeramicCard variant="warning">
            <div className="flex items-center gap-3">
              <Pause className="w-5 h-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-900">Run On Hold</p>
                <p className="text-xs text-amber-700">{run.notes || 'Waiting for resolution'}</p>
              </div>
            </div>
          </CeramicCard>
        )}

        {/* Steps list */}
        {run.status === 'IN_PROGRESS' && (
          <GlassCard>
            <p className="text-xs font-medium text-gray-500 mb-3">Production Steps</p>
            <div className="space-y-2">
              {run.steps.map((step, idx) => (
                <button
                  key={step.id}
                  onClick={() => {
                    setActiveStepIndex(idx);
                    setViewState('step');
                  }}
                  disabled={step.status === 'COMPLETED' || step.status === 'SKIPPED'}
                  className={`
                    w-full flex items-center gap-3 p-3 rounded-xl transition-colors
                    ${step.status === 'IN_PROGRESS' ? 'bg-blue-50 border border-blue-200' : ''}
                    ${step.status === 'PENDING' ? 'hover:bg-gray-50' : ''}
                    ${step.status === 'COMPLETED' || step.status === 'SKIPPED' ? 'opacity-60' : ''}
                  `}
                >
                  {/* Status icon */}
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                    ${step.status === 'COMPLETED' ? 'bg-green-100' : ''}
                    ${step.status === 'SKIPPED' ? 'bg-gray-100' : ''}
                    ${step.status === 'IN_PROGRESS' ? 'bg-blue-100' : ''}
                    ${step.status === 'PENDING' ? 'bg-gray-100' : ''}
                  `}>
                    {step.status === 'COMPLETED' && <Check className="w-4 h-4 text-green-600" />}
                    {step.status === 'SKIPPED' && <XCircle className="w-4 h-4 text-gray-400" />}
                    {step.status === 'IN_PROGRESS' && <Play className="w-4 h-4 text-blue-600" />}
                    {step.status === 'PENDING' && <Clock className="w-4 h-4 text-gray-400" />}
                  </div>
                  
                  {/* Step info */}
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-gray-900">{step.label}</p>
                    <p className="text-xs text-gray-500">Step {step.order}</p>
                  </div>
                  
                  {/* Arrow for actionable steps */}
                  {(step.status === 'PENDING' || step.status === 'IN_PROGRESS') && (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </button>
              ))}
            </div>
          </GlassCard>
        )}

        {/* All steps complete - show complete button */}
        {run.status === 'IN_PROGRESS' && allStepsComplete && (
          <PillButton 
            variant="ceramic" 
            onClick={() => setViewState('complete')}
            icon={<CheckCircle2 className="w-4 h-4" />}
            className="w-full"
          >
            Complete Run
          </PillButton>
        )}

        {/* Hold button */}
        {run.status === 'IN_PROGRESS' && (
          <PillButton 
            variant="glass" 
            onClick={() => setViewState('hold')}
            icon={<Pause className="w-4 h-4" />}
            className="w-full"
          >
            Put On Hold
          </PillButton>
        )}
      </div>
    );
  }

  // Render single step view
  if (viewState === 'step' && activeStep) {
    return (
      <div className="space-y-4">
        {/* Step header */}
        <CeramicCard>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setViewState('overview')}
              className="w-10 h-10 rounded-full surface-glass flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex-1">
              <p className="text-xs text-gray-500">Step {activeStep.order} of {run.steps.length}</p>
              <p className="text-lg font-semibold text-gray-900">{activeStep.label}</p>
            </div>
          </div>
          
          {/* Step status */}
          <div className={`
            px-4 py-3 rounded-xl text-center
            ${activeStep.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}
          `}>
            <p className="text-sm font-medium">
              {activeStep.status === 'IN_PROGRESS' ? 'In Progress' : 'Ready to Start'}
            </p>
          </div>
        </CeramicCard>

        {/* Context info */}
        <GlassCard>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Product</span>
              <span className="text-sm font-medium text-gray-900">{run.product.name}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Quantity</span>
              <span className="text-sm font-medium text-gray-900">{run.quantity} units</span>
            </div>
            {run.batchCode && (
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-500">Batch</span>
                <span className="text-sm font-medium text-gray-900">{run.batchCode}</span>
              </div>
            )}
          </div>
        </GlassCard>

        {/* Error display */}
        {error && (
          <CeramicCard variant="warning">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">{error}</p>
            </div>
          </CeramicCard>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {activeStep.status === 'PENDING' && (
            <PillButton 
              variant="ceramic" 
              onClick={handleStartStep}
              disabled={isSubmitting}
              icon={<Play className="w-4 h-4" />}
              className="w-full"
            >
              {isSubmitting ? 'Starting...' : 'Start Step'}
            </PillButton>
          )}
          
          {activeStep.status === 'IN_PROGRESS' && (
            <PillButton 
              variant="ceramic" 
              onClick={handleCompleteStep}
              disabled={isSubmitting}
              icon={<Check className="w-4 h-4" />}
              className="w-full"
            >
              {isSubmitting ? 'Completing...' : 'Complete Step'}
            </PillButton>
          )}
          
          {activeStep.status !== 'COMPLETED' && activeStep.status !== 'SKIPPED' && (
            <PillButton 
              variant="glass" 
              onClick={handleSkipStep}
              disabled={isSubmitting}
              className="w-full"
            >
              Skip Step
            </PillButton>
          )}
        </div>
      </div>
    );
  }

  // Render complete run view (run completion is automatic when last step completes)
  if (viewState === 'complete') {
    return (
      <div className="space-y-4">
        <CeramicCard>
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-lg font-semibold text-gray-900">Run Complete!</p>
            <p className="text-sm text-gray-500 mt-1">{run.product.name}</p>
            <p className="text-xs text-gray-400 mt-2">
              All production steps have been completed.
            </p>
          </div>
        </CeramicCard>

        <GlassCard>
          <div className="flex justify-between py-2">
            <span className="text-sm text-gray-500">Quantity</span>
            <span className="text-sm font-semibold text-gray-900">{run.quantity} units</span>
          </div>
        </GlassCard>

        <PillButton 
          variant="ceramic" 
          onClick={handleCompleteRun}
          icon={<Check className="w-4 h-4" />}
          className="w-full"
        >
          Back to My Work
        </PillButton>
      </div>
    );
  }

  // Render hold view
  if (viewState === 'hold') {
    return <HoldView onConfirm={handlePutOnHold} onCancel={() => setViewState('overview')} isSubmitting={isSubmitting} />;
  }

  return null;
}

// Hold view component
function HoldView({ 
  onConfirm, 
  onCancel, 
  isSubmitting 
}: { 
  onConfirm: (reason: string) => void; 
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="space-y-4">
      <CeramicCard variant="warning">
        <div className="flex items-start gap-3">
          <Pause className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-900">Put Run On Hold</p>
            <p className="text-xs text-amber-700 mt-1">
              This will pause the production run until the issue is resolved.
            </p>
          </div>
        </div>
      </CeramicCard>

      <GlassCard>
        <label className="block text-xs font-medium text-gray-500 mb-2">
          Reason for hold
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Describe the issue..."
          rows={3}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
        />
      </GlassCard>

      <div className="space-y-2">
        <PillButton 
          variant="ceramic" 
          onClick={() => onConfirm(reason)}
          disabled={isSubmitting || !reason.trim()}
          icon={<Pause className="w-4 h-4" />}
          className="w-full"
        >
          {isSubmitting ? 'Saving...' : 'Confirm Hold'}
        </PillButton>
        <PillButton 
          variant="glass" 
          onClick={onCancel}
          disabled={isSubmitting}
          className="w-full"
        >
          Cancel
        </PillButton>
      </div>
    </div>
  );
}

export default MobileProductionRun;

