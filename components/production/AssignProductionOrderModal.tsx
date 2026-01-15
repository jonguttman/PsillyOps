"use client";

import { useEffect, useState } from "react";
import { UserRole } from "@prisma/client";

interface User {
  id: string;
  name: string;
  role: UserRole;
  email?: string;
}

interface AssignProductionOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (userId: string, reason?: string) => Promise<void>;
  productionOrderId: string;
  orderNumber: string;
  productName: string;
  currentAssignee?: { id: string; name: string } | null;
  isLoading: boolean;
}

export function AssignProductionOrderModal({
  isOpen,
  onClose,
  onAssign,
  productionOrderId,
  orderNumber,
  productName,
  currentAssignee,
  isLoading,
}: AssignProductionOrderModalProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReassignment = !!currentAssignee;

  useEffect(() => {
    if (isOpen) fetchEligibleUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const fetchEligibleUsers = async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const response = await fetch("/api/users?production_execute=true&active=true");
      if (!response.ok) throw new Error("Failed to fetch users");
      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      setError("Failed to load eligible users");
      console.error(err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedUserId) {
      setError("Please select a user");
      return;
    }
    if (isReassignment && !reason.trim()) {
      setError("Reason is required for reassignment");
      return;
    }
    try {
      await onAssign(selectedUserId, reason.trim() || undefined);
      setSelectedUserId("");
      setReason("");
      setError(null);
    } catch (err: any) {
      setError(err.message || "Assignment failed");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{isReassignment ? "🔄" : "👤"}</span>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {isReassignment ? "Reassign" : "Assign"} Production Order
              </h3>
              <p className="text-sm text-gray-500">
                {orderNumber} • {productName}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {isReassignment && currentAssignee && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                Currently assigned to <strong>{currentAssignee.name}</strong>
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* User Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Assign to <span className="text-red-500">*</span>
            </label>

            {loadingUsers ? (
              <div className="text-sm text-gray-500">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="text-sm text-gray-500">No eligible users found</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-2">
                {users.map((user) => (
                  <label
                    key={user.id}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedUserId === user.id
                        ? "bg-blue-50 border-2 border-blue-500"
                        : "bg-gray-50 border border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="assignee"
                      value={user.id}
                      checked={selectedUserId === user.id}
                      onChange={() => {
                        setSelectedUserId(user.id);
                        setError(null);
                      }}
                      className="mt-1 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      disabled={isLoading}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{user.name}</span>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                          {user.role}
                        </span>
                      </div>
                      {user.email && <p className="text-sm text-gray-500 truncate">{user.email}</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason {isReassignment && <span className="text-red-500">*</span>}
              {!isReassignment && <span className="text-gray-400">(optional)</span>}
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
              placeholder={isReassignment ? "Why are you reassigning this order?" : "Optional note about this assignment"}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isLoading}
            />
            {isReassignment && (
              <p className="mt-1 text-xs text-gray-500">
                Reason is required for reassignment and will be logged for audit purposes.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={isLoading || !selectedUserId || (isReassignment && !reason.trim())}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading && (
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            {isLoading ? "Assigning..." : isReassignment ? "Reassign" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}


