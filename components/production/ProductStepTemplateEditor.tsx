'use client';

import { useCallback, useMemo, useState } from 'react';

type StepTemplate = {
  id: string;
  key: string;
  label: string;
  order: number;
  required: boolean;
};

function normalizeKey(input: string) {
  return input.trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '').toLowerCase();
}

export default function ProductStepTemplateEditor({
  productId,
  initialSteps,
  canEdit,
}: {
  productId: string;
  initialSteps: StepTemplate[];
  canEdit: boolean;
}) {
  const [steps, setSteps] = useState<StepTemplate[]>(initialSteps);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newRequired, setNewRequired] = useState(true);

  const sorted = useMemo(() => [...steps].sort((a, b) => a.order - b.order), [steps]);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/products/${productId}/steps`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to load steps');
    setSteps((data.steps as StepTemplate[]) || []);
  }, [productId]);

  const create = useCallback(async () => {
    if (!canEdit) return;
    setBusy(true);
    setError(null);
    try {
      const key = normalizeKey(newKey);
      const label = newLabel.trim();
      if (!key) throw new Error('Key is required');
      if (!label) throw new Error('Label is required');

      const res = await fetch(`/api/products/${productId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, label, required: newRequired }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create step');

      setNewKey('');
      setNewLabel('');
      setNewRequired(true);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create step');
    } finally {
      setBusy(false);
    }
  }, [canEdit, newKey, newLabel, newRequired, productId, refresh]);

  const patch = useCallback(
    async (stepId: string, patchBody: Partial<Pick<StepTemplate, 'label' | 'required'>>) => {
      if (!canEdit) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/products/${productId}/steps/${stepId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchBody),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to update step');
        await refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to update step');
      } finally {
        setBusy(false);
      }
    },
    [canEdit, productId, refresh]
  );

  const del = useCallback(
    async (stepId: string) => {
      if (!canEdit) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/products/${productId}/steps/${stepId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to delete step');
        await refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to delete step');
      } finally {
        setBusy(false);
      }
    },
    [canEdit, productId, refresh]
  );

  const reorder = useCallback(
    async (orderedStepIds: string[]) => {
      if (!canEdit) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/products/${productId}/steps/reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderedStepIds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to reorder steps');
        setSteps((data.steps as StepTemplate[]) || []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to reorder steps');
      } finally {
        setBusy(false);
      }
    },
    [canEdit, productId]
  );

  const move = useCallback(
    async (stepId: string, dir: -1 | 1) => {
      const idx = sorted.findIndex((s) => s.id === stepId);
      if (idx < 0) return;
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;
      const next = [...sorted];
      const tmp = next[idx];
      next[idx] = next[swapIdx];
      next[swapIdx] = tmp;
      await reorder(next.map((s) => s.id));
    },
    [sorted, reorder]
  );

  return (
    <div className="space-y-4">
      {error ? (
        <div className="p-3 rounded-md border border-red-200 bg-red-50 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Default production steps</h2>
            <p className="mt-1 text-xs text-gray-500">
              These templates apply to <span className="font-medium">future</span> runs only.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refresh().catch(() => {})}
            className="text-xs text-blue-600 hover:text-blue-800"
            disabled={busy}
          >
            Refresh
          </button>
        </div>

        <div className="divide-y divide-gray-100">
          {sorted.length === 0 ? (
            <div className="px-4 py-4 text-sm text-gray-600">No step templates yet.</div>
          ) : (
            sorted.map((s, i) => (
              <div key={s.id} className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-6">{s.order}</span>
                      <input
                        value={s.label}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSteps((prev) => prev.map((p) => (p.id === s.id ? { ...p, label: v } : p)));
                        }}
                        onBlur={() => patch(s.id, { label: s.label })}
                        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md"
                        disabled={!canEdit || busy}
                      />
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Key: <span className="font-mono">{s.key}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-gray-700 select-none">
                      <input
                        type="checkbox"
                        checked={s.required}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setSteps((prev) => prev.map((p) => (p.id === s.id ? { ...p, required: v } : p)));
                          patch(s.id, { required: v }).catch(() => {});
                        }}
                        disabled={!canEdit || busy}
                      />
                      Required
                    </label>

                    <div className="flex flex-col">
                      <button
                        type="button"
                        className="px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                        onClick={() => move(s.id, -1)}
                        disabled={!canEdit || busy || i === 0}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="mt-1 px-2 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                        onClick={() => move(s.id, 1)}
                        disabled={!canEdit || busy || i === sorted.length - 1}
                        title="Move down"
                      >
                        ↓
                      </button>
                    </div>

                    <button
                      type="button"
                      className="px-3 py-2 text-xs font-medium text-red-700 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
                      onClick={() => del(s.id)}
                      disabled={!canEdit || busy}
                      title="Delete (only if unused by active runs)"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add new step */}
      <div className="bg-white shadow rounded-lg p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-900">Add step</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Key</label>
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="mix, encapsulate, label…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              disabled={!canEdit || busy}
            />
            <div className="mt-1 text-xs text-gray-500">
              Auto-normalized to <span className="font-mono">{normalizeKey(newKey || 'step_key')}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Human-friendly label"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              disabled={!canEdit || busy}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
                disabled={!canEdit || busy}
              />
              Required
            </label>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => create()}
            disabled={!canEdit || busy}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Add step'}
          </button>
        </div>
        {!canEdit ? (
          <div className="text-xs text-gray-500">You don’t have permission to edit templates.</div>
        ) : null}
      </div>
    </div>
  );
}

