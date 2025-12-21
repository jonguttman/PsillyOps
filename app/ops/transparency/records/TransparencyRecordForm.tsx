'use client';

/**
 * Transparency Record Form Component
 * 
 * Used for both creating and editing transparency records.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, ArrowLeft, Save, Trash2 } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface Batch {
  id: string;
  batchCode: string;
  productName: string;
}

interface Lab {
  id: string;
  name: string;
  location: string;
}

interface TransparencyRecord {
  id: string;
  entityType: string;
  entityId: string;
  productionDate: string;
  batchCode: string | null;
  labId: string | null;
  testDate: string | null;
  testResult: string | null;
  rawMaterialLinked: boolean;
  publicDescription: string | null;
}

interface TransparencyRecordFormProps {
  products: Product[];
  batches: Batch[];
  labs: Lab[];
  record?: TransparencyRecord;
}

export default function TransparencyRecordForm({
  products,
  batches,
  labs,
  record,
}: TransparencyRecordFormProps) {
  const router = useRouter();
  const isEditing = !!record;

  const [entityType, setEntityType] = useState(record?.entityType || 'PRODUCT');
  const [entityId, setEntityId] = useState(record?.entityId || '');
  const [productionDate, setProductionDate] = useState(
    record?.productionDate
      ? new Date(record.productionDate).toISOString().split('T')[0]
      : ''
  );
  const [batchCode, setBatchCode] = useState(record?.batchCode || '');
  const [labId, setLabId] = useState(record?.labId || '');
  const [testDate, setTestDate] = useState(
    record?.testDate
      ? new Date(record.testDate).toISOString().split('T')[0]
      : ''
  );
  const [testResult, setTestResult] = useState(record?.testResult || '');
  const [rawMaterialLinked, setRawMaterialLinked] = useState(
    record?.rawMaterialLinked ?? true
  );
  const [publicDescription, setPublicDescription] = useState(
    record?.publicDescription || ''
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        entityType,
        entityId,
        productionDate,
        batchCode: batchCode || null,
        labId: labId || null,
        testDate: testDate || null,
        testResult: testResult || null,
        rawMaterialLinked,
        publicDescription: publicDescription || null,
      };

      const url = isEditing
        ? `/api/transparency/records/${record.id}`
        : '/api/transparency/records';
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save record');
      }

      router.push('/ops/transparency');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!record) return;
    if (!confirm('Are you sure you want to delete this transparency record?')) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/transparency/records/${record.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete record');
      }

      router.push('/ops/transparency');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/ops/transparency"
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditing ? 'Edit Transparency Record' : 'New Transparency Record'}
            </h1>
            <p className="text-sm text-gray-500">
              {isEditing
                ? 'Update the transparency information'
                : 'Create a new transparency record for a product or batch'}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Entity Selection */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-medium text-gray-900">Entity</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Entity Type
            </label>
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setEntityId('');
              }}
              disabled={isEditing}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            >
              <option value="PRODUCT">Product</option>
              <option value="BATCH">Batch</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {entityType === 'PRODUCT' ? 'Product' : 'Batch'}
            </label>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              disabled={isEditing}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
            >
              <option value="">Select {entityType === 'PRODUCT' ? 'a product' : 'a batch'}</option>
              {entityType === 'PRODUCT'
                ? products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))
                : batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.productName} - {b.batchCode}
                    </option>
                  ))}
            </select>
          </div>
        </div>

        {/* Production Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-medium text-gray-900">Production Info</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Production Date
              </label>
              <input
                type="date"
                value={productionDate}
                onChange={(e) => setProductionDate(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Batch Code (optional)
              </label>
              <input
                type="text"
                value={batchCode}
                onChange={(e) => setBatchCode(e.target.value)}
                placeholder="e.g., LOT-2024-001"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Testing Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-medium text-gray-900">Testing Info</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Testing Lab
            </label>
            <select
              value={labId}
              onChange={(e) => setLabId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a lab</option>
              {labs.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.name} ({lab.location})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Test Date
              </label>
              <input
                type="date"
                value={testDate}
                onChange={(e) => setTestDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Test Result
              </label>
              <select
                value={testResult}
                onChange={(e) => setTestResult(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Not Set</option>
                <option value="PASS">PASS</option>
                <option value="PENDING">PENDING</option>
                <option value="FAIL">FAIL (Admin Only)</option>
              </select>
              {testResult === 'FAIL' && (
                <p className="mt-1 text-xs text-red-600">
                  FAIL results are not shown on the public transparency page.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-medium text-gray-900">Additional Info</h2>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="rawMaterialLinked"
              checked={rawMaterialLinked}
              onChange={(e) => setRawMaterialLinked(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="rawMaterialLinked" className="text-sm text-gray-700">
              Raw materials are linked and verified
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Public Description (optional)
            </label>
            <textarea
              value={publicDescription}
              onChange={(e) => setPublicDescription(e.target.value)}
              rows={4}
              placeholder="Additional information to display on the public transparency page..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          {isEditing ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete Record
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <Link
              href="/ops/transparency"
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Save Record'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

