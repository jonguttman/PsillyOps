'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDownIcon, ChevronRightIcon, ClockIcon, CheckCircleIcon } from 'lucide-react';

interface Step {
  id: string;
  order: number;
  label: string;
  status: string;
  stepType: string;
  estimatedMinutes: number | null;
}

interface Batch {
  id: string;
  batchCode: string;
  status: string;
  plannedQuantity: number;
}

interface ProductionRun {
  id: string;
  status: string;
  quantity: number;
  batches: Batch[];
  steps: Step[];
}

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface ProductionOrder {
  id: string;
  orderNumber: string;
  status: string;
  quantityToMake: number;
  scheduledDate: string | Date | null;
  createdAt: string | Date;
  product: Product;
  assignedTo?: { id: string; name: string | null } | null;
  productionRuns: ProductionRun[];
}

interface StandaloneRun {
  id: string;
  status: string;
  quantity: number;
  createdAt: string | Date;
  product: Product;
  assignedTo?: { id: string; name: string | null } | null;
  batches: Batch[];
  steps: Step[];
}

interface AssignedStep {
  id: string;
  order: number;
  label: string;
  status: string;
  productionRun: {
    id: string;
    status: string;
    quantity: number;
    product: Product;
  };
}

interface MyWorkClientProps {
  assignedOrders: ProductionOrder[];
  assignedRuns: StandaloneRun[];
  assignedSteps: AssignedStep[];
  isAdmin: boolean;
  showAllWork?: boolean;
}

const statusColors: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-700 border-gray-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-200',
  COMPLETED: 'bg-green-100 text-green-800 border-green-200',
  BLOCKED: 'bg-red-100 text-red-800 border-red-200',
  PENDING: 'bg-gray-100 text-gray-700 border-gray-200',
  RELEASED: 'bg-green-100 text-green-800 border-green-200',
};

const stepTypeIcons: Record<string, string> = {
  EQUIPMENT_CHECK: '🔧',
  MATERIAL_ISSUE: '📦',
  INSTRUCTION: '📝',
};

export function MyWorkClient({ 
  assignedOrders, 
  assignedRuns, 
  assignedSteps,
  isAdmin,
  showAllWork = false,
}: MyWorkClientProps) {
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(
    new Set(assignedOrders.filter(o => o.status === 'IN_PROGRESS').map(o => o.id))
  );
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(
    new Set(assignedRuns.filter(r => r.status === 'IN_PROGRESS').map(r => r.id))
  );

  const toggleOrder = (orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const toggleRun = (runId: string) => {
    setExpandedRuns(prev => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Assigned Production Orders */}
      {assignedOrders.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span className="text-lg">📋</span>
            Assigned Production Orders ({assignedOrders.length})
          </h2>
          <div className="bg-white shadow rounded-lg overflow-hidden">
            {assignedOrders.map((order) => {
              const isExpanded = expandedOrders.has(order.id);
              const run = order.productionRuns[0];
              const nextSteps = run?.steps || [];
              
              return (
                <div key={order.id} className="border-b border-gray-100 last:border-b-0">
                  {/* Order Header */}
                  <div 
                    className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleOrder(order.id)}
                  >
                    <button className="text-gray-400">
                      {isExpanded ? (
                        <ChevronDownIcon className="h-5 w-5" />
                      ) : (
                        <ChevronRightIcon className="h-5 w-5" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {order.orderNumber}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[order.status]}`}>
                          {order.status}
                        </span>
                        {showAllWork && order.assignedTo && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200">
                            → {order.assignedTo.name}
                          </span>
                        )}
                        {showAllWork && !order.assignedTo && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                            Unassigned
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        {order.product.name} ({order.product.sku}) • {order.quantityToMake} units
                      </div>
                    </div>
                    <Link
                      href={`/ops/production/${order.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                    >
                      View Order
                    </Link>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && run && (
                    <div className="px-5 pb-4 pl-12 space-y-4">
                      {/* Batches */}
                      {run.batches.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                            Batches ({run.batches.length})
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                            {run.batches.map((batch) => (
                              <div 
                                key={batch.id}
                                className="px-3 py-2 bg-gray-50 rounded-lg text-sm"
                              >
                                <div className="font-mono text-xs text-gray-600 truncate">
                                  {batch.batchCode}
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-gray-500">{batch.plannedQuantity} units</span>
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${statusColors[batch.status]}`}>
                                    {batch.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Next Steps */}
                      {nextSteps.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                            Next Steps
                          </h4>
                          <div className="space-y-1">
                            {nextSteps.map((step) => (
                              <div 
                                key={step.id}
                                className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg"
                              >
                                <span className="text-sm">{stepTypeIcons[step.stepType] || '📝'}</span>
                                <span className="text-sm font-medium text-gray-700">
                                  {step.order}. {step.label}
                                </span>
                                {step.estimatedMinutes && (
                                  <span className="flex items-center gap-1 text-xs text-gray-500">
                                    <ClockIcon className="h-3 w-3" />
                                    ~{step.estimatedMinutes}m
                                  </span>
                                )}
                                <span className={`ml-auto inline-flex items-center px-2 py-0.5 rounded text-xs ${statusColors[step.status]}`}>
                                  {step.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Button */}
                      <div className="pt-2">
                        <Link
                          href={`/ops/production-runs/${run.id}`}
                          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                        >
                          {run.status === 'IN_PROGRESS' ? 'Continue Production' : 'Start Production'}
                        </Link>
                      </div>
                    </div>
                  )}

                  {isExpanded && !run && (
                    <div className="px-5 pb-4 pl-12">
                      <p className="text-sm text-gray-500">
                        No production run created yet. Start the order to create a production run.
                      </p>
                      <Link
                        href={`/ops/production/${order.id}`}
                        className="inline-flex items-center mt-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                      >
                        Start Order
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Standalone Production Runs (not linked to orders assigned to user) */}
      {assignedRuns.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span className="text-lg">🔄</span>
            Assigned Production Runs ({assignedRuns.length})
          </h2>
          <div className="bg-white shadow rounded-lg overflow-hidden">
            {assignedRuns.map((run) => {
              const isExpanded = expandedRuns.has(run.id);
              
              return (
                <div key={run.id} className="border-b border-gray-100 last:border-b-0">
                  {/* Run Header */}
                  <div 
                    className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleRun(run.id)}
                  >
                    <button className="text-gray-400">
                      {isExpanded ? (
                        <ChevronDownIcon className="h-5 w-5" />
                      ) : (
                        <ChevronRightIcon className="h-5 w-5" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {run.product.name}
                        </span>
                        <span className="text-sm text-gray-500">({run.product.sku})</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[run.status]}`}>
                          {run.status}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        {run.quantity} units • {run.batches.length} batch{run.batches.length !== 1 ? 'es' : ''}
                      </div>
                    </div>
                    <Link
                      href={`/ops/production-runs/${run.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      {run.status === 'IN_PROGRESS' ? 'Continue' : 'Start'}
                    </Link>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-5 pb-4 pl-12 space-y-4">
                      {/* Batches */}
                      {run.batches.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                            Batches
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                            {run.batches.map((batch) => (
                              <div 
                                key={batch.id}
                                className="px-3 py-2 bg-gray-50 rounded-lg text-sm"
                              >
                                <div className="font-mono text-xs text-gray-600 truncate">
                                  {batch.batchCode}
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-gray-500">{batch.plannedQuantity} units</span>
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${statusColors[batch.status]}`}>
                                    {batch.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Next Steps */}
                      {run.steps.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 uppercase mb-2">
                            Next Steps
                          </h4>
                          <div className="space-y-1">
                            {run.steps.map((step) => (
                              <div 
                                key={step.id}
                                className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg"
                              >
                                <span className="text-sm">{stepTypeIcons[step.stepType] || '📝'}</span>
                                <span className="text-sm font-medium text-gray-700">
                                  {step.order}. {step.label}
                                </span>
                                {step.estimatedMinutes && (
                                  <span className="flex items-center gap-1 text-xs text-gray-500">
                                    <ClockIcon className="h-3 w-3" />
                                    ~{step.estimatedMinutes}m
                                  </span>
                                )}
                                <span className={`ml-auto inline-flex items-center px-2 py-0.5 rounded text-xs ${statusColors[step.status]}`}>
                                  {step.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legacy: Assigned Steps */}
      {assignedSteps.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <span className="text-lg">✅</span>
            Assigned Steps ({assignedSteps.length})
          </h2>
          <div className="bg-white shadow rounded-lg overflow-hidden divide-y divide-gray-100">
            {assignedSteps.map((s) => (
              <div key={s.id} className="px-5 py-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    {s.productionRun.product.name}{' '}
                    <span className="text-gray-400">({s.productionRun.product.sku})</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Run qty {s.productionRun.quantity} • Step {s.order}: {s.label}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[s.status]}`}>
                    {s.status}
                  </span>
                  <Link
                    href={`/ops/production-runs/${s.productionRun.id}`}
                    className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    Resume
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

