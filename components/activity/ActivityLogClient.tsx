'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw, AlertCircle } from 'lucide-react';
import type { ActivityEntity } from '@prisma/client';

import ActivityLogFilters, { ActivityFilters } from '@/components/activity/ActivityLogFilters';
import ActivityLogRow, { ActivityLogItem } from '@/components/activity/ActivityLogRow';

interface UserOption {
  id: string;
  name: string;
}

interface ActivityLogClientProps {
  users: UserOption[];
}

const PAGE_SIZE = 25;

function isoNow() {
  return new Date().toISOString();
}

function computePresetRange(preset: ActivityFilters['timeRange']): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString();
  const start = new Date(now);

  switch (preset) {
    case '24h':
      start.setHours(start.getHours() - 24);
      break;
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    default:
      start.setHours(start.getHours() - 24);
  }

  return { startDate: start.toISOString(), endDate };
}

function dateKeyLocal(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function parseBool(v: string | null, defaultValue: boolean) {
  if (v === null) return defaultValue;
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return defaultValue;
}

function normalizeFiltersFromQuery(searchParams: URLSearchParams): ActivityFilters {
  const timeRange = (searchParams.get('timeRange') as ActivityFilters['timeRange']) || '24h';
  const includeSystem = parseBool(searchParams.get('includeSystem'), true);

  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const range = startDate && endDate ? { startDate, endDate } : computePresetRange(timeRange);

  const entityTypeRaw = searchParams.get('entityType') || undefined;
  const entityType =
    entityTypeRaw === 'QR'
      ? 'QR'
      : (entityTypeRaw as ActivityEntity | undefined);

  return {
    entityType,
    userId: searchParams.get('userId') || undefined,
    includeSystem,
    timeRange,
    startDate: range.startDate,
    endDate: range.endDate,
    actionCategory: searchParams.get('actionCategory') || undefined,
  };
}

function buildQueryParams(filters: ActivityFilters) {
  const params = new URLSearchParams();

  if (filters.entityType) params.set('entityType', String(filters.entityType));
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.actionCategory) params.set('actionCategory', filters.actionCategory);

  params.set('includeSystem', filters.includeSystem ? '1' : '0');
  params.set('timeRange', filters.timeRange);
  params.set('startDate', filters.startDate);
  params.set('endDate', filters.endDate);

  return params;
}

export default function ActivityLogClient({ users }: ActivityLogClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<ActivityFilters>(() => ({
    entityType: undefined,
    userId: undefined,
    includeSystem: true,
    timeRange: '24h',
    ...computePresetRange('24h'),
    actionCategory: undefined,
  }));

  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [serverTotal, setServerTotal] = useState<number>(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep local filter state synced to the URL (shareable links).
  useEffect(() => {
    const next = normalizeFiltersFromQuery(new URLSearchParams(searchParams.toString()));
    setFilters(next);
  }, [searchParams]);

  // On first load, ensure default range is present in the URL.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    if (!sp.get('startDate') || !sp.get('endDate')) {
      const next = normalizeFiltersFromQuery(sp);
      next.timeRange = '24h';
      const range = computePresetRange('24h');
      next.startDate = range.startDate;
      next.endDate = range.endDate;

      const qp = buildQueryParams(next);
      router.replace(`?${qp.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPage = useCallback(
    async (nextOffset: number, mode: 'replace' | 'append') => {
      if (mode === 'append') setLoadingMore(true);
      else setLoading(true);

      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(nextOffset));

        // Entity type filter
        if (filters.entityType && filters.entityType !== 'QR') {
          params.set('entityType', String(filters.entityType));
        }

        // Actor filter (supports 'system' sentinel)
        if (filters.userId) params.set('userId', filters.userId);

        // Time range
        if (filters.startDate) params.set('startDate', filters.startDate);
        if (filters.endDate) params.set('endDate', filters.endDate);

        // Action category
        if (filters.actionCategory) params.set('actionCategory', filters.actionCategory);

        // Special handling for synthetic entity type "QR"
        // We map it onto QR-related tags server-side via actionCategory/tag matching.
        if (filters.entityType === 'QR' && !filters.actionCategory) {
          params.set('actionCategory', 'scan');
        }

        const res = await fetch(`/api/activity?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch activity');
        const data = await res.json();

        const fetched: ActivityLogItem[] = Array.isArray(data.logs) ? data.logs : [];
        const visible = filters.includeSystem ? fetched : fetched.filter((l) => Boolean(l.user));

        setServerTotal(typeof data.total === 'number' ? data.total : 0);
        setOffset(nextOffset);
        setLogs((prev) => (mode === 'append' ? [...prev, ...visible] : visible));
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : typeof e === 'string' ? e : 'Failed to load activity';
        setError(message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters]
  );

  // Refetch when filters change.
  useEffect(() => {
    setOffset(0);
    fetchPage(0, 'replace');
  }, [
    fetchPage,
    filters.entityType,
    filters.userId,
    filters.includeSystem,
    filters.startDate,
    filters.endDate,
    filters.actionCategory,
  ]);

  const updateFilters = (next: ActivityFilters) => {
    // Normalize preset → concrete date range so links are auditable.
    const normalized: ActivityFilters = { ...next };

    if (!normalized.startDate || !normalized.endDate) {
      const range = computePresetRange(normalized.timeRange);
      normalized.startDate = range.startDate;
      normalized.endDate = range.endDate;
    }

    // "Now" based ranges should capture the moment you changed the filter.
    // (Makes links stable instead of drifting as time passes.)
    if (normalized.timeRange === '24h' || normalized.timeRange === '7d' || normalized.timeRange === '30d') {
      const range = computePresetRange(normalized.timeRange);
      normalized.startDate = range.startDate;
      normalized.endDate = range.endDate || isoNow();
    }

    const qp = buildQueryParams(normalized);
    router.replace(`?${qp.toString()}`);
    setFilters(normalized);
  };

  const canLoadMore = logs.length > 0 && logs.length < serverTotal;

  const grouped = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; items: ActivityLogItem[] }>();
    for (const item of logs) {
      const key = dateKeyLocal(item.createdAt);
      if (!groups.has(key)) {
        groups.set(key, { key, label: formatDayLabel(item.createdAt), items: [] });
      }
      groups.get(key)!.items.push(item);
    }
    return Array.from(groups.values());
  }, [logs]);

  return (
    <div className="space-y-4">
      <ActivityLogFilters filters={filters} onFiltersChange={updateFilters} users={users} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {loading ? (
            'Loading activity…'
          ) : (
            <>
              Showing <span className="font-medium text-gray-900">{logs.length}</span>
              {filters.includeSystem ? (
                <>
                  {' '}
                  of <span className="font-medium text-gray-900">{serverTotal}</span>
                </>
              ) : (
                <span className="text-gray-400"> (system hidden)</span>
              )}
            </>
          )}
        </div>

        <button
          onClick={() => fetchPage(0, 'replace')}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {logs.length === 0 && !loading ? (
          <div className="p-10 text-center text-gray-500">
            <div className="text-sm font-medium text-gray-700">
              {filters.timeRange === '24h'
                ? 'No activity in the last 24 hours.'
                : 'No activity for the selected time range.'}
            </div>
            <div className="text-sm mt-1">
              Inventory changes, production steps, and QR scans will appear here.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {grouped.map((group) => (
              <div key={group.key} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-600">{group.label}</div>
                  <div className="text-xs text-gray-400">{group.items.length}</div>
                </div>

                <div className="relative mt-2">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />
                  <div className="space-y-1">
                    {group.items.map((activity) => (
                      <ActivityLogRow key={activity.id} activity={activity} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {canLoadMore && (
        <div className="flex justify-center">
          <button
            onClick={() => fetchPage(offset + PAGE_SIZE, 'append')}
            disabled={loading || loadingMore}
            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}

