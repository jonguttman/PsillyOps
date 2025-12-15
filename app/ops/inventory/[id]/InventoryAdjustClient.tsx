'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';

type UserRole = 'ADMIN' | 'WAREHOUSE' | 'PRODUCTION' | 'REP';

type AdjustmentType =
  | 'PRODUCTION_COMPLETE'
  | 'PRODUCTION_SCRAP'
  | 'MANUAL_CORRECTION'
  | 'RECEIVING'
  | 'CONSUMPTION';

type RelatedEntityType = '' | 'PRODUCTION_ORDER' | 'BATCH' | 'QR_TOKEN';

interface Props {
  inventoryId: string;
  userRole: UserRole;
  unitOfMeasure: string;
  initialOnHand: number;
  initialReserved: number;
}

function isIntString(v: string) {
  return /^-?\d+$/.test(v.trim());
}

function getErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const msg = (data as Record<string, unknown>)['message'];
  return typeof msg === 'string' ? msg : null;
}

export default function InventoryAdjustClient({
  inventoryId,
  userRole,
  unitOfMeasure,
  initialOnHand,
  initialReserved,
}: Props) {
  const router = useRouter();

  const canAdjust = userRole === 'ADMIN' || userRole === 'WAREHOUSE';

  const [onHand, setOnHand] = useState<number>(initialOnHand);
  const reserved = initialReserved;
  const available = useMemo(() => onHand - reserved, [onHand, reserved]);

  const [isOpen, setIsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('MANUAL_CORRECTION');
  const [qtyRaw, setQtyRaw] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [relatedEntityType, setRelatedEntityType] = useState<RelatedEntityType>('');
  const [relatedEntityId, setRelatedEntityId] = useState<string>('');

  const qtyInt = isIntString(qtyRaw) ? parseInt(qtyRaw, 10) : null;
  const isValid =
    canAdjust &&
    qtyInt !== null &&
    qtyInt !== 0 &&
    reason.trim().length > 0 &&
    (relatedEntityType ? relatedEntityId.trim().length > 0 : true);

  const handleSubmit = async () => {
    if (!isValid || qtyInt === null) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/inventory/${inventoryId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deltaQty: qtyInt,
          reason: reason.trim(),
          adjustmentType,
          ...(relatedEntityType ? { relatedEntityType, relatedEntityId: relatedEntityId.trim() } : {}),
        }),
      });

      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = getErrorMessage(data) || 'Failed to adjust inventory';
        throw new Error(msg);
      }

      // Immediate UI update
      setOnHand((prev) => prev + qtyInt);

      // Close + reset modal
      setIsOpen(false);
      setQtyRaw('');
      setReason('');
      setRelatedEntityType('');
      setRelatedEntityId('');

      // Refresh server-rendered sections (movement history, related panels, etc.)
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to adjust inventory');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Overview quantities */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <div className="text-sm text-gray-500">On Hand</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">
            {onHand.toLocaleString()}
            <span className="text-sm font-normal text-gray-500 ml-2">{unitOfMeasure}</span>
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Reserved</div>
          <div className="mt-1 text-2xl font-semibold text-yellow-600">
            {reserved.toLocaleString()}
            <span className="text-sm font-normal text-gray-500 ml-2">{unitOfMeasure}</span>
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Available</div>
          <div className="mt-1 text-2xl font-semibold text-green-600">
            {available.toLocaleString()}
            <span className="text-sm font-normal text-gray-500 ml-2">{unitOfMeasure}</span>
          </div>
        </div>
        <div className="flex items-end justify-end">
          {canAdjust && (
            <button
              onClick={() => setIsOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Adjust Inventory
            </button>
          )}
        </div>
      </div>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 sm:p-0">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
              onClick={() => !submitting && setIsOpen(false)}
            />

            {/* Panel */}
            <div className="relative w-full max-w-lg bg-white rounded-lg shadow-xl border border-gray-200">
              <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100">
                <div>
                  <div className="text-sm font-semibold text-gray-900">Adjust Inventory</div>
                  <div className="text-xs text-gray-500">Inventory ID: {inventoryId.slice(0, 10)}…</div>
                </div>
                <button
                  onClick={() => !submitting && setIsOpen(false)}
                  className="p-1 rounded hover:bg-gray-100 text-gray-500"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-4 py-4 space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Adjustment Type *
                    </label>
                    <select
                      value={adjustmentType}
                      onChange={(e) => setAdjustmentType(e.target.value as AdjustmentType)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="MANUAL_CORRECTION">Manual Correction</option>
                      <option value="PRODUCTION_COMPLETE">Production Complete</option>
                      <option value="PRODUCTION_SCRAP">Production Scrap</option>
                      <option value="RECEIVING">Receiving</option>
                      <option value="CONSUMPTION">Consumption</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Quantity (+/-) *
                    </label>
                    <input
                      value={qtyRaw}
                      onChange={(e) => setQtyRaw(e.target.value)}
                      placeholder="e.g. 25 or -10"
                      inputMode="numeric"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <div className="mt-1 text-xs text-gray-500">
                      Cannot be 0. Integer only.
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Reason *
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Explain why inventory changed (cycle count, damaged, etc.)"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Optional Link
                    </label>
                    <select
                      value={relatedEntityType}
                      onChange={(e) => {
                        const next = e.target.value as RelatedEntityType;
                        setRelatedEntityType(next);
                        if (!next) setRelatedEntityId('');
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">None</option>
                      <option value="PRODUCTION_ORDER">Production Order</option>
                      <option value="BATCH">Batch</option>
                      <option value="QR_TOKEN">QR Token</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {relatedEntityType ? 'Related ID *' : 'Related ID'}
                    </label>
                    <input
                      value={relatedEntityId}
                      onChange={(e) => setRelatedEntityId(e.target.value)}
                      disabled={!relatedEntityType}
                      placeholder={
                        relatedEntityType === 'QR_TOKEN'
                          ? 'qr_… (token value)'
                          : relatedEntityType
                            ? 'Paste ID'
                            : '—'
                      }
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </div>

                <div className="text-xs text-gray-500">
                  Preview: On hand will become{' '}
                  <span className="font-medium text-gray-700">
                    {qtyInt !== null ? (onHand + qtyInt).toLocaleString() : '—'}
                  </span>
                  {' '}
                  {unitOfMeasure}.
                </div>
              </div>

              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
                <button
                  onClick={() => setIsOpen(false)}
                  disabled={submitting}
                  className="px-3 py-2 text-sm rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!isValid || submitting}
                  className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Applying…' : 'Apply Adjustment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

