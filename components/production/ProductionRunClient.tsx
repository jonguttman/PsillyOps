'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import RunHeaderCard from '@/components/production/RunHeaderCard';
import StepChecklist from '@/components/production/StepChecklist';
import StepActionBar from '@/components/production/StepActionBar';

type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
type RunStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type ProductionRunApiDetail = {
  ok: true;
  run: {
    id: string;
    productId: string;
    product: { id: string; name: string; sku: string };
    quantity: number;
    status: RunStatus;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    qr:
      | {
          id: string;
          token: string;
          status: string;
          url: string | null;
        }
      | null;
    steps: Array<{
      id: string;
      templateKey: string;
      label: string;
      order: number;
      required: boolean;
      status: StepStatus;
      startedAt: string | null;
      completedAt: string | null;
      skippedAt: string | null;
      skipReason: string | null;
      performedById: string | null;
      assignedToUserId: string | null;
    }>;
    currentStep:
      | {
          stepId: string;
          stepKey: string;
          stepLabel: string;
          status: StepStatus;
          order: number;
        }
      | null;
    health?: {
      hasRequiredSkips: boolean;
      hasStalledStep: boolean;
      isBlocked: boolean;
    };
  };
};

type MyActiveRunsResponse = {
  ok: true;
  runs: Array<{
    runId: string;
    productId: string;
    productName: string;
    productSku: string;
    quantity: number;
    runStatus: RunStatus;
    currentStep:
      | {
          stepId: string;
          stepKey: string;
          stepLabel: string;
          stepStatus: StepStatus;
          order: number;
        }
      | null;
    lastActionAt: string;
  }>;
};

export default function ProductionRunClient({
  runId,
  initial,
  userRole,
  userId,
}: {
  runId: string;
  initial?: ProductionRunApiDetail['run'];
  userRole?: string;
  userId?: string;
}) {
  const [run, setRun] = useState<ProductionRunApiDetail['run'] | null>(initial || null);
  const [myActive, setMyActive] = useState<MyActiveRunsResponse['runs']>([]);
  const [loading, setLoading] = useState(false);
  const [actionBusyStepId, setActionBusyStepId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [editSteps, setEditSteps] = useState(false);
  const [newStepLabel, setNewStepLabel] = useState('');
  const [newStepRequired, setNewStepRequired] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchRun = useCallback(async () => {
    const res = await fetch(`/api/production-runs/${runId}`, { cache: 'no-store' });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || `Failed to fetch run (${res.status})`);
    }
    const data = (await res.json()) as ProductionRunApiDetail;
    if (!data?.ok) throw new Error('Failed to fetch run');
    setRun(data.run);
  }, [runId]);

  const fetchMyActive = useCallback(async () => {
    const res = await fetch('/api/production-runs/my-active', { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as MyActiveRunsResponse;
    if (!data?.ok || !Array.isArray(data.runs)) return;
    setMyActive(data.runs);
  }, []);

  useEffect(() => {
    setError(null);
    fetchRun().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load run'));
    fetchMyActive().catch(() => {});
  }, [fetchRun, fetchMyActive]);

  const activeStep = useMemo(() => {
    if (!run) return null;
    return run.steps.find((s) => s.status === 'IN_PROGRESS') || null;
  }, [run]);

  const canStartAny = !!run && !activeStep && run.status !== 'CANCELLED' && run.status !== 'COMPLETED';
  const canEditSteps = !!userRole && ['ADMIN', 'PRODUCTION'].includes(userRole);
  const runIsEditable = !!run && run.status === 'PLANNED' && run.steps.every((s) => s.status === 'PENDING');

  const canActOnStep = useCallback(
    (stepAssignedToUserId: string | null) => {
      if (userRole === 'ADMIN') return true;
      if (!userId) return false;
      return stepAssignedToUserId === userId;
    },
    [userId, userRole]
  );

  const doAction = useCallback(
    async (stepId: string, fn: () => Promise<void>) => {
      setLoading(true);
      setActionBusyStepId(stepId);
      setError(null);
      try {
        await fn();
        await Promise.all([fetchRun(), fetchMyActive()]);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Action failed');
      } finally {
        setActionBusyStepId(null);
        setLoading(false);
      }
    },
    [fetchRun, fetchMyActive]
  );

  const start = useCallback(
    async (stepId: string) => {
      await doAction(stepId, async () => {
        const res = await fetch(`/api/production-runs/steps/${stepId}/start`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text());
      });
    },
    [doAction]
  );

  const claim = useCallback(
    async (stepId: string) => {
      await doAction(stepId, async () => {
        const res = await fetch(`/api/production-runs/steps/${stepId}/claim`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text());
      });
    },
    [doAction]
  );

  const stop = useCallback(
    async (stepId: string) => {
      await doAction(stepId, async () => {
        const res = await fetch(`/api/production-runs/steps/${stepId}/stop`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text());
      });
    },
    [doAction]
  );

  const complete = useCallback(
    async (stepId: string) => {
      await doAction(stepId, async () => {
        const res = await fetch(`/api/production-runs/steps/${stepId}/complete`, { method: 'POST' });
        if (!res.ok) throw new Error(await res.text());
      });
    },
    [doAction]
  );

  const skip = useCallback(
    async (stepId: string, reason: string) => {
      await doAction(stepId, async () => {
        const res = await fetch(`/api/production-runs/steps/${stepId}/skip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        });
        if (!res.ok) throw new Error(await res.text());
      });
    },
    [doAction]
  );

  if (!run) {
    return (
      <div className="space-y-4">
        {error ? <div className="p-3 rounded-md border border-red-200 bg-red-50 text-sm text-red-700">{error}</div> : null}
        <div className="text-sm text-gray-500">Loading production run…</div>
      </div>
    );
  }

  const myActiveStep = myActive.find((r) => r.currentStep?.stepStatus === 'IN_PROGRESS') || null;

  const runEditReorder = useCallback(
    async (orderedStepIds: string[]) => {
      await doAction(runId, async () => {
        const res = await fetch(`/api/production-runs/${runId}/steps/reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedStepIds }),
        });
        if (!res.ok) throw new Error(await res.text());
      });
    },
    [doAction, runId]
  );

  const moveStep = useCallback(
    async (stepId: string, dir: -1 | 1) => {
      const ordered = [...run.steps].sort((a, b) => a.order - b.order);
      const idx = ordered.findIndex((s) => s.id === stepId);
      if (idx < 0) return;
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= ordered.length) return;
      const next = [...ordered];
      const tmp = next[idx];
      next[idx] = next[swapIdx];
      next[swapIdx] = tmp;
      await runEditReorder(next.map((s) => s.id));
    },
    [run.steps, runEditReorder]
  );

  const addStep = useCallback(async () => {
    const label = newStepLabel.trim();
    if (!label) {
      setError('Step label is required.');
      return;
    }
    await doAction(runId, async () => {
      const res = await fetch(`/api/production-runs/${runId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, required: newStepRequired }),
      });
      if (!res.ok) throw new Error(await res.text());
    });
    setNewStepLabel('');
    setNewStepRequired(true);
  }, [doAction, newStepLabel, newStepRequired, runId]);

  const updateStep = useCallback(
    async (stepId: string, patch: { label?: string; required?: boolean }) => {
      await doAction(stepId, async () => {
        const res = await fetch(`/api/production-runs/steps/${stepId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(await res.text());
      });
    },
    [doAction]
  );

  const removeStep = useCallback(
    async (stepId: string) => {
      await doAction(stepId, async () => {
        const res = await fetch(`/api/production-runs/steps/${stepId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(await res.text());
      });
    },
    [doAction]
  );

  return (
    <div className="space-y-4 pb-24">
      {error ? <div className="p-3 rounded-md border border-red-200 bg-red-50 text-sm text-red-700">{error}</div> : null}

      <RunHeaderCard run={run} />

      {/* Health warnings */}
      {run.health && (run.health.hasRequiredSkips || run.health.hasStalledStep || run.health.isBlocked) ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <div className="font-semibold">Run health warning</div>
          <ul className="mt-2 space-y-1 list-disc list-inside">
            {run.health.hasRequiredSkips ? <li>One or more required steps were skipped.</li> : null}
            {run.health.hasStalledStep ? <li>A step appears stalled (in progress &gt; 4 hours).</li> : null}
            {run.health.isBlocked ? <li>This run is blocked (no available steps to start).</li> : null}
          </ul>
        </div>
      ) : null}

      {/* Admin/supervisor: run step overrides (pre-start only) */}
      {canEditSteps ? (
        <div className="bg-white shadow rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">Run step overrides</div>
              <div className="text-xs text-gray-500">
                Edit this run’s step checklist without changing the product templates.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditSteps((v) => !v)}
              disabled={!runIsEditable || loading}
              className="px-3 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {editSteps ? 'Done' : 'Edit steps'}
            </button>
          </div>

          {!runIsEditable ? (
            <div className="mt-3 text-sm text-gray-600">
              Steps can only be edited <span className="font-medium">before</span> production starts.
            </div>
          ) : editSteps ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-md border border-gray-200 divide-y divide-gray-100">
                {[...run.steps].sort((a, b) => a.order - b.order).map((s, idx, arr) => (
                  <div key={s.id} className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-6">{s.order}</span>
                        <input
                          value={s.label}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRun((prev) =>
                              prev
                                ? { ...prev, steps: prev.steps.map((p) => (p.id === s.id ? { ...p, label: v } : p)) }
                                : prev
                            );
                          }}
                          onBlur={() => updateStep(s.id, { label: s.label })}
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md"
                          disabled={loading}
                        />
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Key: <span className="font-mono">{s.templateKey}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-xs text-gray-700 select-none">
                        <input
                          type="checkbox"
                          checked={s.required}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setRun((prev) =>
                              prev
                                ? { ...prev, steps: prev.steps.map((p) => (p.id === s.id ? { ...p, required: v } : p)) }
                                : prev
                            );
                            updateStep(s.id, { required: v }).catch(() => {});
                          }}
                          disabled={loading}
                        />
                        Required
                      </label>

                      <div className="flex flex-col">
                        <button
                          type="button"
                          className="px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                          onClick={() => moveStep(s.id, -1)}
                          disabled={loading || idx === 0}
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="mt-1 px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                          onClick={() => moveStep(s.id, 1)}
                          disabled={loading || idx === arr.length - 1}
                          title="Move down"
                        >
                          ↓
                        </button>
                      </div>

                      <button
                        type="button"
                        className="px-3 py-2 text-xs font-medium text-red-700 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
                        onClick={() => removeStep(s.id)}
                        disabled={loading}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-md p-3 space-y-2">
                <div className="text-xs font-medium text-gray-700">Add ad-hoc step</div>
                <div className="flex gap-2">
                  <input
                    value={newStepLabel}
                    onChange={(e) => setNewStepLabel(e.target.value)}
                    placeholder="Step label…"
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md"
                    disabled={loading}
                  />
                  <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
                    <input
                      type="checkbox"
                      checked={newStepRequired}
                      onChange={(e) => setNewStepRequired(e.target.checked)}
                      disabled={loading}
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={() => addStep()}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                <div className="text-xs text-gray-500">
                  Changes are logged and affect <span className="font-medium">this run only</span>.
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Multi-tasking */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">My active</h2>
          <button
            onClick={() => fetchMyActive()}
            className="text-xs text-blue-600 hover:text-blue-800"
            disabled={loading}
          >
            Refresh
          </button>
        </div>
        {myActiveStep ? (
          <div className="mt-2 text-sm text-gray-700">
            <div className="font-medium">Active step</div>
            <div className="mt-1">
              <Link className="text-blue-600 hover:text-blue-800" href={`/production-runs/${myActiveStep.runId}`}>
                {myActiveStep.productName} × {myActiveStep.quantity}
              </Link>
              <span className="text-gray-500"> — {myActiveStep.currentStep?.stepLabel}</span>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-sm text-gray-500">No active step right now.</div>
        )}

        <div className="mt-3">
          <div className="text-xs font-medium text-gray-500">My runs</div>
          {myActive.length === 0 ? (
            <div className="mt-1 text-sm text-gray-500">No recent runs.</div>
          ) : (
            <div className="mt-2 space-y-2">
              {myActive.slice(0, 5).map((r) => (
                <Link
                  key={r.runId}
                  href={`/production-runs/${r.runId}`}
                  className="block rounded-md border border-gray-200 p-3 hover:bg-gray-50"
                >
                  <div className="text-sm font-medium text-gray-900">{r.productName}</div>
                  <div className="text-xs text-gray-500">
                    Qty {r.quantity} • {r.runStatus}
                    {r.currentStep ? ` • Step ${r.currentStep.order}: ${r.currentStep.stepLabel}` : ''}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Required steps are marked. Skipped steps show justification.
      </div>

      <StepChecklist
        steps={run.steps}
        nowMs={now}
        canStartAny={canStartAny}
        actionBusyStepId={actionBusyStepId}
        userId={userId}
        userRole={userRole}
        onClaim={claim}
        onStart={start}
      />

      <StepActionBar
        activeStep={activeStep}
        nowMs={now}
        busy={!!actionBusyStepId}
        userId={userId}
        userRole={userRole}
        assignedToUserId={activeStep ? activeStep.assignedToUserId : null}
        onStop={() => activeStep && stop(activeStep.id)}
        onComplete={() => activeStep && complete(activeStep.id)}
        onSkip={(reason) => activeStep && skip(activeStep.id, reason)}
      />
    </div>
  );
}

