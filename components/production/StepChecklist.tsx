'use client';

type StepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export default function StepChecklist({
  steps,
  nowMs,
  canStartAny,
  actionBusyStepId,
  userId,
  userRole,
  onClaim,
  onStart,
}: {
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
    assignedToUserId: string | null;
  }>;
  nowMs: number;
  canStartAny: boolean;
  actionBusyStepId: string | null;
  userId?: string;
  userRole?: string;
  onClaim: (stepId: string) => void;
  onStart: (stepId: string) => void;
}) {
  const statusColors: Record<StepStatus, string> = {
    PENDING: 'bg-gray-100 text-gray-700 border-gray-200',
    IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
    COMPLETED: 'bg-green-100 text-green-800 border-green-200',
    SKIPPED: 'bg-amber-100 text-amber-800 border-amber-200',
  };

  function formatElapsed(startedAt: string | null) {
    if (!startedAt) return null;
    const startMs = new Date(startedAt).getTime();
    if (!Number.isFinite(startMs)) return null;
    const diff = Math.max(0, nowMs - startMs);
    const s = Math.floor(diff / 1000);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (hh > 0) return `${hh}h ${mm}m`;
    if (mm > 0) return `${mm}m ${ss}s`;
    return `${ss}s`;
  }

  const hasInProgress = steps.some((s) => s.status === 'IN_PROGRESS');
  const canAct = (assignedToUserId: string | null) => {
    if (userRole === 'ADMIN') return true;
    if (!userId) return false;
    return assignedToUserId === userId;
  };

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Steps</h2>
        <span className="text-xs text-gray-500">{steps.length} total</span>
      </div>

      <div className="divide-y divide-gray-100">
        {steps.map((s) => {
          const isBusy = actionBusyStepId === s.id;
          const canStartThis = canStartAny && s.status === 'PENDING' && !hasInProgress;
          const elapsed = s.status === 'IN_PROGRESS' ? formatElapsed(s.startedAt) : null;
          const isAssignedToMe = !!userId && s.assignedToUserId === userId;
          const canStartByAssignment = canAct(s.assignedToUserId);
          const showSkipReason = s.status === 'SKIPPED' && !!s.skipReason;
          const isRequiredAndSkipped = s.required && s.status === 'SKIPPED';
          const statusLabel =
            s.status === 'IN_PROGRESS'
              ? 'In progress'
              : s.status === 'SKIPPED'
                ? 'Skipped'
                : s.status === 'COMPLETED'
                  ? 'Completed'
                  : 'Pending';

          return (
            <div key={s.id} className="px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-6">{s.order}</span>
                    <div className="text-sm font-medium text-gray-900 truncate">{s.label}</div>
                    {s.required ? (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border border-indigo-200 bg-indigo-50 text-indigo-700"
                        title="Required step — must be completed or skipped with justification."
                      >
                        Required
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">(optional)</span>
                    )}
                  </div>
                  {showSkipReason ? (
                    <div className={`mt-1 text-xs ${isRequiredAndSkipped ? 'text-amber-700' : 'text-gray-600'}`}>
                      <span className="font-medium">Justification:</span> {s.skipReason}
                    </div>
                  ) : null}
                  <div className="mt-1 text-xs text-gray-500">
                    <span className="font-mono">{s.templateKey}</span>
                    {s.status === 'IN_PROGRESS' && s.startedAt ? (
                      <>
                        {' '}
                        • Started {new Date(s.startedAt).toLocaleTimeString()} {elapsed ? `• ${elapsed}` : ''}
                      </>
                    ) : null}
                    {s.status === 'PENDING' ? (
                      <>
                        {' '}
                        •{' '}
                        {s.assignedToUserId ? (
                          isAssignedToMe ? (
                            <span className="text-emerald-700">Assigned to you</span>
                          ) : (
                            <span className="text-gray-500">Assigned</span>
                          )
                        ) : (
                          <span className="text-gray-500">Unassigned</span>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                      statusColors[s.status]
                    }`}
                  >
                    {statusLabel}
                    {isRequiredAndSkipped ? (
                      <span className="ml-1 text-amber-700" title="Required step was skipped">
                        ⚠
                      </span>
                    ) : null}
                  </span>

                  {canStartThis ? (
                    !s.assignedToUserId ? (
                      <button
                        onClick={() => onClaim(s.id)}
                        disabled={isBusy}
                        className="w-28 inline-flex items-center justify-center px-3 py-2 rounded-md bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
                      >
                        {isBusy ? 'Claiming…' : 'Claim'}
                      </button>
                    ) : (
                      <button
                        onClick={() => onStart(s.id)}
                        disabled={isBusy || !canStartByAssignment}
                        className="w-28 inline-flex items-center justify-center px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
                      >
                        {isBusy ? 'Starting…' : 'Start'}
                      </button>
                    )
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

