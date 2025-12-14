'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock, Ban, ActivitySquare, RefreshCw } from 'lucide-react';

type AttentionSummary = {
  ok: true;
  requiredSkips: number;
  stalled: number;
  blocked: number;
  activeRuns: number;
};

export default function ProductionAttentionCard() {
  const [data, setData] = useState<AttentionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/production-runs/attention-summary', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch');
      const json = (await res.json()) as AttentionSummary;
      if (!json?.ok) throw new Error('Bad response');
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch {
      setError('Failed to load production attention summary');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 30000);
    const handleFocus = () => fetchSummary();
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchSummary]);

  const requiredSkips = data?.requiredSkips ?? 0;
  const stalled = data?.stalled ?? 0;
  const blocked = data?.blocked ?? 0;
  const activeRuns = data?.activeRuns ?? 0;

  const hasAnyAttention = requiredSkips > 0 || stalled > 0 || blocked > 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ActivitySquare className="w-5 h-5 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Production Attention</h2>
          {hasAnyAttention ? (
            <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">
              Needs attention
            </span>
          ) : null}
        </div>
        <button
          onClick={() => {
            setIsLoading(true);
            fetchSummary();
          }}
          disabled={isLoading}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error ? (
        <div className="px-5 py-6 text-center text-sm text-red-600">{error}</div>
      ) : isLoading && !data ? (
        <div className="px-5 py-6 text-center text-sm text-gray-500">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading…
        </div>
      ) : (
        <div className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link
              href="/production-runs"
              className="rounded-md border border-gray-200 p-3 hover:bg-gray-50"
              title="View production runs"
            >
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <ActivitySquare className="w-4 h-4 text-blue-500" />
                Active Runs
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{activeRuns}</div>
            </Link>

            <Link
              href="/production-runs"
              className="rounded-md border border-gray-200 p-3 hover:bg-gray-50"
              title="Runs with required steps skipped"
            >
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Required Skips
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{requiredSkips}</div>
            </Link>

            <Link
              href="/production-runs"
              className="rounded-md border border-gray-200 p-3 hover:bg-gray-50"
              title="Runs with stalled in-progress steps"
            >
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Clock className="w-4 h-4 text-amber-500" />
                Stalled
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{stalled}</div>
            </Link>

            <Link
              href="/production-runs"
              className="rounded-md border border-gray-200 p-3 hover:bg-gray-50"
              title="Runs that appear blocked"
            >
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Ban className="w-4 h-4 text-amber-500" />
                Blocked
              </div>
              <div className="mt-1 text-2xl font-semibold text-gray-900">{blocked}</div>
            </Link>
          </div>

          <div className="mt-3 text-xs text-gray-400">
            Auto-refreshes every 30s • Updated {lastRefresh.toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
}

