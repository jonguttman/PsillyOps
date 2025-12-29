'use client';

import { useState, useEffect } from 'react';
import { XIcon } from 'lucide-react';

interface User {
  id: string;
  name: string | null;
  role: string;
}

interface StartProductionModalProps {
  orderId: string;
  orderNumber: string;
  productName: string;
  quantityToMake: number;
  currentAssignee?: { id: string; name: string | null } | null;
  onStart: (assignToUserId?: string) => Promise<void>;
  onClose: () => void;
}

export function StartProductionModal({
  orderId,
  orderNumber,
  productName,
  quantityToMake,
  currentAssignee,
  onStart,
  onClose,
}: StartProductionModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(currentAssignee?.id);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch('/api/users?production_execute=true&active=true');
        if (!res.ok) throw new Error('Failed to fetch users');
        const data = await res.json();
        setUsers(data.users || []);
        // Default to current assignee if set
        if (currentAssignee?.id) {
          setSelectedUserId(currentAssignee.id);
        }
      } catch (err) {
        setError('Failed to load eligible users');
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, [currentAssignee]);

  const handleStart = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onStart(selectedUserId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start production');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-500"
          >
            <XIcon className="h-5 w-5" />
          </button>

          {/* Header */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Start Production</h3>
            <p className="mt-1 text-sm text-gray-500">
              Starting order {orderNumber}
            </p>
          </div>

          {/* Order Summary */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm">
              <div className="font-medium text-gray-900">{productName}</div>
              <div className="text-gray-500">{quantityToMake} units to produce</div>
            </div>
          </div>

          {/* Assignment Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assign to
            </label>
            {loading ? (
              <div className="text-sm text-gray-500">Loading users...</div>
            ) : error && users.length === 0 ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                <label className="flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    name="assignee"
                    value=""
                    checked={!selectedUserId}
                    onChange={() => setSelectedUserId(undefined)}
                    className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="ml-3 text-sm text-gray-600">Unassigned (assign later)</span>
                </label>
                {users.map((user) => (
                  <label 
                    key={user.id}
                    className={`flex items-center p-2 rounded hover:bg-gray-50 cursor-pointer ${
                      selectedUserId === user.id ? 'bg-blue-50 border border-blue-200' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name="assignee"
                      value={user.id}
                      checked={selectedUserId === user.id}
                      onChange={() => setSelectedUserId(user.id)}
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-3 text-sm text-gray-900">{user.name || 'Unknown'}</span>
                    <span className="ml-2 text-xs text-gray-500">({user.role})</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <strong>What happens next:</strong>
            <ul className="mt-1 list-disc list-inside text-blue-700">
              <li>A Production Run will be created</li>
              <li>Batches will be generated based on batch size</li>
              <li>Steps will be created from product manufacturing setup</li>
            </ul>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleStart}
              disabled={submitting || loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Starting...' : 'Start Production'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

