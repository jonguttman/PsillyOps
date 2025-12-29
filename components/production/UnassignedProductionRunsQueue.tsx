"use client";

import { useState } from "react";
import Link from "next/link";
import { UserRole } from "@prisma/client";
import { hasPermission } from "@/lib/auth/rbac";
import { AssignProductionRunModal } from "./AssignProductionRunModal";

interface UnassignedRun {
  id: string;
  product: {
    id: string;
    name: string;
    sku: string;
  };
  quantity: number;
  status: string;
  createdAt: string;
}

interface UnassignedProductionRunsQueueProps {
  runs: UnassignedRun[];
  userRole: string;
  onAssigned?: (runId: string) => void;
}

export function UnassignedProductionRunsQueue({
  runs: initialRuns,
  userRole,
  onAssigned,
}: UnassignedProductionRunsQueueProps) {
  const [runs, setRuns] = useState(initialRuns);
  const [selectedRun, setSelectedRun] = useState<UnassignedRun | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const canAssign = hasPermission(userRole as UserRole, "production", "assign");

  const handleAssign = async (userId: string, reason?: string) => {
    if (!selectedRun) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/production-runs/${selectedRun.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToUserId: userId, reason }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to assign production run");
      }

      // Remove from local list
      setRuns((prev) => prev.filter((r) => r.id !== selectedRun.id));
      onAssigned?.(selectedRun.id);
      setSelectedRun(null);
    } catch (error: any) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays}d ago`;
    } else if (diffHours > 0) {
      return `${diffHours}h ago`;
    } else {
      return "Just now";
    }
  };

  if (runs.length === 0) {
    return null; // Don't show empty queue
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-amber-600 text-lg">⚠</span>
        <h3 className="text-sm font-semibold text-amber-900">
          Unassigned Production Runs ({runs.length})
        </h3>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {runs.map((run) => (
          <div
            key={run.id}
            className="flex items-center justify-between bg-white rounded-md border border-amber-100 p-3"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/ops/production-runs/${run.id}`}
                className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
              >
                {run.product.name}
              </Link>
              <div className="text-xs text-gray-500 mt-0.5">
                {run.product.sku} • Qty {run.quantity} • {formatDate(run.createdAt)}
              </div>
            </div>

            {canAssign && (
              <button
                onClick={() => setSelectedRun(run)}
                className="ml-3 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
              >
                Assign
              </button>
            )}
          </div>
        ))}
      </div>

      {runs.length > 5 && (
        <div className="mt-2 text-xs text-amber-700">
          Showing {Math.min(runs.length, 10)} of {runs.length} unassigned runs
        </div>
      )}

      {/* Assignment Modal */}
      {selectedRun && (
        <AssignProductionRunModal
          isOpen={true}
          onClose={() => setSelectedRun(null)}
          onAssign={handleAssign}
          productionRunId={selectedRun.id}
          productName={selectedRun.product.name}
          currentAssignee={null}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}

