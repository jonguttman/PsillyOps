"use client";

import { useState } from "react";
import { AssignProductionRunModal } from "./AssignProductionRunModal";
import { UserRole } from "@prisma/client";
import { hasPermission } from "@/lib/auth/rbac";

interface AssignmentInfo {
  assignedTo: { id: string; name: string; role: UserRole } | null;
  assignedBy: { id: string; name: string } | null;
  assignedAt: string | null;
  assignmentReason: string | null;
}

interface ProductionRunAssignmentProps {
  runId: string;
  productName: string;
  status: string;
  assignment: AssignmentInfo;
  userRole: string;
  onAssignmentChange?: (newAssignment: AssignmentInfo) => void;
}

export function ProductionRunAssignment({
  runId,
  productName,
  status,
  assignment,
  userRole,
  onAssignmentChange,
}: ProductionRunAssignmentProps) {
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [localAssignment, setLocalAssignment] = useState(assignment);

  const canAssign = hasPermission(userRole as UserRole, "production", "assign");
  const isAssignable = status !== "COMPLETED" && status !== "CANCELLED";

  const handleAssign = async (userId: string, reason?: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/production-runs/${runId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToUserId: userId, reason }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to assign production run");
      }

      const data = await response.json();
      
      // Update local state
      const newAssignment: AssignmentInfo = {
        assignedTo: data.productionRun.assignedTo,
        assignedBy: data.productionRun.assignedBy,
        assignedAt: data.productionRun.assignedAt,
        assignmentReason: data.productionRun.assignmentReason,
      };
      
      setLocalAssignment(newAssignment);
      onAssignmentChange?.(newAssignment);
      setShowModal(false);
    } catch (error: any) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">Assignment</h2>
        {canAssign && isAssignable && (
          <button
            onClick={() => setShowModal(true)}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
              localAssignment.assignedTo
                ? "text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200"
                : "text-white bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {localAssignment.assignedTo ? "Reassign" : "Assign"}
          </button>
        )}
      </div>

      {localAssignment.assignedTo ? (
        <div className="space-y-3">
          {/* Assigned To */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-medium text-sm">
              {localAssignment.assignedTo.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-gray-900">
                {localAssignment.assignedTo.name}
              </div>
              <div className="text-xs text-gray-500">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                  {localAssignment.assignedTo.role}
                </span>
              </div>
            </div>
          </div>

          {/* Assignment Details */}
          <div className="text-xs text-gray-500 space-y-1 border-t border-gray-100 pt-2">
            {localAssignment.assignedAt && (
              <div>
                Assigned {formatDate(localAssignment.assignedAt)}
                {localAssignment.assignedBy && (
                  <> by {localAssignment.assignedBy.name}</>
                )}
              </div>
            )}
            {localAssignment.assignmentReason && (
              <div className="italic text-gray-400">
                &ldquo;{localAssignment.assignmentReason}&rdquo;
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500 py-2">
          <div className="flex items-center gap-2">
            <span className="text-amber-500">⚠</span>
            <span>Not assigned</span>
          </div>
          {!canAssign && (
            <p className="mt-1 text-xs text-gray-400">
              You don&apos;t have permission to assign production runs.
            </p>
          )}
          {!isAssignable && (
            <p className="mt-1 text-xs text-gray-400">
              {status === "COMPLETED" ? "Completed" : "Cancelled"} runs cannot be assigned.
            </p>
          )}
        </div>
      )}

      {/* Modal */}
      <AssignProductionRunModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onAssign={handleAssign}
        productionRunId={runId}
        productName={productName}
        currentAssignee={localAssignment.assignedTo ? {
          id: localAssignment.assignedTo.id,
          name: localAssignment.assignedTo.name,
        } : null}
        isLoading={isLoading}
      />
    </div>
  );
}

