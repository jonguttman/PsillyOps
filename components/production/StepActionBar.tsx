'use client';

import { useMemo, useState } from 'react';

type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export default function StepActionBar({
  activeStep,
  nowMs,
  busy,
  userId,
  userRole,
  assignedToUserId,
  onStop,
  onComplete,
  onSkip,
}: {
  activeStep:
    | {
        id: string;
        templateKey: string;
        label: string;
        order: number;
        required: boolean;
        status: StepStatus;
        startedAt: string | null;
      }
    | null;
  nowMs: number;
  busy: boolean;
  userId?: string;
  userRole?: string;
  assignedToUserId: string | null;
  onStop: () => void;
  onComplete: () => void;
  onSkip: (reason: string) => void;
}) {
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [skipError, setSkipError] = useState<string | null>(null);

  const elapsed = useMemo(() => {
    if (!activeStep?.startedAt) return null;
    const startMs = new Date(activeStep.startedAt).getTime();
    if (!Number.isFinite(startMs)) return null;
    const diff = Math.max(0, nowMs - startMs);
    const s = Math.floor(diff / 1000);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (hh > 0) return `${hh}h ${mm}m`;
    if (mm > 0) return `${mm}m ${ss}s`;
    return `${ss}s`;
  }, [activeStep?.startedAt, nowMs]);

  const canAct = useMemo(() => {
    if (!activeStep) return false;
    if (userRole === 'ADMIN') return true;
    if (!userId) return false;
    return assignedToUserId === userId;
  }, [activeStep, assignedToUserId, userId, userRole]);

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto p-3 space-y-2">
          {activeStep ? (
            <>
              <div className="text-sm text-gray-700">
                <span className="font-semibold">Active step:</span> {activeStep.order}. {activeStep.label}{' '}
                <span className="text-gray-500">{elapsed ? `• ${elapsed}` : ''}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={onStop}
                  disabled={busy || !canAct}
                  className="inline-flex items-center justify-center px-3 py-3 rounded-md bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Stop
                </button>
                <button
                  onClick={onComplete}
                  disabled={busy || !canAct}
                  className="inline-flex items-center justify-center px-3 py-3 rounded-md bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Complete
                </button>
                <button
                  onClick={() => {
                    setSkipError(null);
                    setSkipReason('');
                    setSkipOpen(true);
                  }}
                  disabled={busy || !canAct}
                  className="inline-flex items-center justify-center px-3 py-3 rounded-md bg-amber-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Skip
                </button>
              </div>
              {!canAct ? (
                <div className="text-xs text-amber-700">
                  This step is assigned to another worker.
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-sm text-gray-600">No active step. Start a pending step to begin.</div>
          )}
        </div>
      </div>

      {/* Skip modal */}
      {skipOpen ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white shadow-lg overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-900">Skip step</div>
              <button onClick={() => setSkipOpen(false)} className="text-sm text-gray-600 hover:text-gray-900">
                Close
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-sm text-gray-700">
                Provide a reason (min 5 chars). This will be logged in Activity Log.
              </div>
              <textarea
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="Reason…"
              />
              {skipError ? <div className="text-sm text-red-700">{skipError}</div> : null}
              <button
                onClick={() => {
                  const r = skipReason.trim();
                  if (r.length < 5) {
                    setSkipError('Reason must be at least 5 characters.');
                    return;
                  }
                  setSkipOpen(false);
                  onSkip(r);
                }}
                className="w-full inline-flex items-center justify-center px-3 py-3 rounded-md bg-amber-600 text-white text-sm font-semibold"
              >
                Confirm skip
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

