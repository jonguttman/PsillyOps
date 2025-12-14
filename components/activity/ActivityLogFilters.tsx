'use client';

import { ActivityEntity } from '@prisma/client';

export interface ActivityFilters {
  entityType?: ActivityEntity | 'QR';
  userId?: string; // may be 'system'
  includeSystem: boolean;
  timeRange: '24h' | '7d' | '30d';
  startDate: string;
  endDate: string;
  actionCategory?: string;
}

interface User {
  id: string;
  name: string;
}

interface ActivityLogFiltersProps {
  filters: ActivityFilters;
  onFiltersChange: (filters: ActivityFilters) => void;
  users: User[];
}

const ENTITY_TYPES: { value: ActivityFilters['entityType'] | ''; label: string }[] = [
  { value: '', label: 'All entities' },
  { value: 'QR', label: 'QR' },
  { value: ActivityEntity.PRODUCT, label: 'Product' },
  { value: ActivityEntity.BATCH, label: 'Batch' },
  { value: ActivityEntity.INVENTORY, label: 'Inventory' },
  { value: ActivityEntity.PURCHASE_ORDER, label: 'Purchase Order' },
  { value: ActivityEntity.ORDER, label: 'Order' },
  // Avoid direct enum member dependency in case Prisma types are stale in dev
  { value: 'PRODUCTION_RUN' as ActivityEntity, label: 'Production Run' },
  { value: ActivityEntity.MATERIAL, label: 'Material' },
];

const TIME_RANGES: { value: ActivityFilters['timeRange']; label: string }[] = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

const ACTION_CATEGORIES: { value: string; label: string }[] = [
  { value: '', label: 'All actions' },
  { value: 'scan', label: 'Scan' },
  { value: 'print', label: 'Print' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'production', label: 'Production Complete' },
  { value: 'received', label: 'Receiving' },
  { value: 'redirect', label: 'Redirect' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'ai', label: 'AI' },
  { value: 'status_change', label: 'Status Change' },
];

export default function ActivityLogFilters({
  filters,
  onFiltersChange,
  users,
}: ActivityLogFiltersProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <div className="flex flex-wrap gap-4">
        {/* Entity Type */}
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Entity
          </label>
          <select
            value={filters.entityType || ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                entityType: (e.target.value as ActivityEntity | 'QR') || undefined,
              })
            }
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {ENTITY_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        {/* Actor */}
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Actor
          </label>
          <select
            value={filters.userId || ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                userId: e.target.value || undefined,
                includeSystem: e.target.value === 'system' ? true : filters.includeSystem,
              })
            }
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Users</option>
            <option value="system">System only</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>

        {/* Include System */}
        <div className="flex items-end min-w-[160px]">
          <label className="flex items-center gap-2 select-none text-sm text-gray-700">
            <input
              type="checkbox"
              checked={filters.includeSystem}
              onChange={(e) =>
                onFiltersChange({
                  ...filters,
                  includeSystem: e.target.checked,
                })
              }
              disabled={filters.userId === 'system'}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <span className="text-xs font-medium text-gray-600">Include system</span>
          </label>
        </div>

        {/* Time Range */}
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Time Range
          </label>
          <select
            value={filters.timeRange}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                timeRange: e.target.value as ActivityFilters['timeRange'],
              })
            }
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {TIME_RANGES.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
        </div>

        {/* Action Category */}
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Action
          </label>
          <select
            value={filters.actionCategory || ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                actionCategory: e.target.value || undefined,
              })
            }
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {ACTION_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

