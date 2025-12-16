import { auth } from "@/lib/auth/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function SecurityDashboardPage() {
  const session = await auth();

  // Not logged in → send to login
  if (!session || !session.user) {
    redirect("/login");
  }

  // Not an admin → forbidden
  if (session.user.role !== "ADMIN") {
    redirect("/ops/dashboard");
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Security Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Read-only security monitoring and audit log overview
        </p>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Auth Activity Panel */}
        <AuthActivityPanel />

        {/* Sensitive Actions Panel */}
        <SensitiveActionsPanel />

        {/* Account Snapshot Panel */}
        <AccountSnapshotPanel />

        {/* System Errors Panel */}
        <SystemErrorsPanel />
      </div>

      {/* Footer Navigation */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <Link 
          href="/ops/activity"
          className="text-blue-600 hover:text-blue-800 hover:underline"
        >
          ← View Full Activity Log
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// AUTH ACTIVITY PANEL
// ============================================================================

async function AuthActivityPanel() {
  let data;
  let error;

  try {
    // Direct import for server-side - more efficient than fetch
    const { prisma } = await import('@/lib/db/prisma');
    
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - 24);

    const events = await prisma.activityLog.findMany({
      where: {
        action: {
          in: ['AUTH_LOGIN_SUCCESS', 'AUTH_LOGIN_FAILURE', 'AUTH_LOGOUT', 'AUTH_SESSION_CREATED']
        },
        createdAt: {
          gte: startDate
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });

    const summary = {
      totalEvents: events.length,
      successfulLogins: events.filter(e => e.action === 'AUTH_LOGIN_SUCCESS').length,
      failedLogins: events.filter(e => e.action === 'AUTH_LOGIN_FAILURE').length,
      logouts: events.filter(e => e.action === 'AUTH_LOGOUT').length,
      sessionsCreated: events.filter(e => e.action === 'AUTH_SESSION_CREATED').length,
      uniqueUsers: new Set(events.filter(e => e.userId).map(e => e.userId)).size,
      uniqueIPs: new Set(events.filter(e => e.ipAddress).map(e => e.ipAddress)).size,
    };

    data = { events, summary };
  } catch (err) {
    error = 'Failed to load auth activity';
    console.error('[SecurityDashboard] Auth activity error:', err);
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Auth Activity (Last 24h)
      </h2>

      {error && (
        <div className="text-sm text-red-600 mb-4">{error}</div>
      )}

      {data && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <StatCard 
              label="Successful Logins" 
              value={data.summary.successfulLogins}
              color="green"
            />
            <StatCard 
              label="Failed Logins" 
              value={data.summary.failedLogins}
              color={data.summary.failedLogins > 0 ? "red" : "gray"}
            />
            <StatCard 
              label="Unique Users" 
              value={data.summary.uniqueUsers}
              color="blue"
            />
            <StatCard 
              label="Unique IPs" 
              value={data.summary.uniqueIPs}
              color="blue"
            />
          </div>

          {/* Recent Events */}
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {data.events.length === 0 && (
              <p className="text-sm text-gray-500 italic">No auth events in the last 24 hours</p>
            )}
            {data.events.slice(0, 10).map((event: any) => (
              <div key={event.id} className="text-sm border-l-2 border-gray-300 pl-3 py-1">
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${
                    event.action === 'AUTH_LOGIN_FAILURE' ? 'text-red-700' : 'text-gray-900'
                  }`}>
                    {event.action.replace('AUTH_', '').replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-gray-600 mt-1">{event.summary}</div>
                {event.ipAddress && (
                  <div className="text-xs text-gray-500 mt-1">
                    IP: {event.ipAddress}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// SENSITIVE ACTIONS PANEL
// ============================================================================

async function SensitiveActionsPanel() {
  let data;
  let error;

  try {
    const { prisma } = await import('@/lib/db/prisma');
    const { ActivityEntity } = await import('@prisma/client');
    
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - 24);

    const actions = await prisma.activityLog.findMany({
      where: {
        entityType: {
          in: ['PRODUCT', 'MATERIAL', 'BATCH', 'INVENTORY', 'PRODUCTION_ORDER', 'PURCHASE_ORDER'] as any[]
        },
        createdAt: {
          gte: startDate
        },
        OR: [
          { tags: { string_contains: 'created' } },
          { tags: { string_contains: 'deleted' } },
          { tags: { string_contains: 'status_change' } },
          { tags: { string_contains: 'quantity_change' } },
          { tags: { string_contains: 'adjustment' } }
        ]
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });

    const summary = {
      totalActions: actions.length,
      byEntityType: actions.reduce((acc, action) => {
        const type = action.entityType || 'UNKNOWN';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      byUser: actions.reduce((acc, action) => {
        if (action.user) {
          const key = action.user.email;
          acc[key] = (acc[key] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>)
    };

    data = { actions, summary };
  } catch (err) {
    error = 'Failed to load sensitive actions';
    console.error('[SecurityDashboard] Sensitive actions error:', err);
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Sensitive Actions (Last 24h)
      </h2>

      {error && (
        <div className="text-sm text-red-600 mb-4">{error}</div>
      )}

      {data && (
        <>
          {/* Summary by Entity Type */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">By Entity Type</h3>
            <div className="space-y-2">
              {Object.entries(data.summary.byEntityType).map(([type, count]: [string, any]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{type}</span>
                  <span className="font-medium text-gray-900">{count}</span>
                </div>
              ))}
              {Object.keys(data.summary.byEntityType).length === 0 && (
                <p className="text-sm text-gray-500 italic">No sensitive actions recorded</p>
              )}
            </div>
          </div>

          {/* Recent Actions */}
          <div className="space-y-3 max-h-64 overflow-y-auto">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Recent Activity</h3>
            {data.actions.slice(0, 8).map((action: any) => (
              <div key={action.id} className="text-sm border-l-2 border-blue-300 pl-3 py-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">
                    {action.entityType}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(action.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-gray-600 mt-1">{action.summary}</div>
                {action.user && (
                  <div className="text-xs text-gray-500 mt-1">
                    By: {action.user.name} ({action.user.role})
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// ACCOUNT SNAPSHOT PANEL
// ============================================================================

async function AccountSnapshotPanel() {
  let data;
  let error;

  try {
    const { prisma } = await import('@/lib/db/prisma');
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivity = await prisma.activityLog.groupBy({
      by: ['userId'],
      where: {
        userId: { not: null },
        createdAt: { gte: sevenDaysAgo }
      },
      _count: true
    });

    const activityMap = recentActivity.reduce((acc, item) => {
      if (item.userId) {
        acc[item.userId] = item._count;
      }
      return acc;
    }, {} as Record<string, number>);

    const summary = {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.active).length,
      inactiveUsers: users.filter(u => !u.active).length,
      byRole: users.reduce((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      recentlyActive: Object.keys(activityMap).length
    };

    const enrichedUsers = users.map(user => ({
      ...user,
      recentActivityCount: activityMap[user.id] || 0
    }));

    data = { users: enrichedUsers, summary };
  } catch (err) {
    error = 'Failed to load account snapshot';
    console.error('[SecurityDashboard] Account snapshot error:', err);
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Account Snapshot
      </h2>

      {error && (
        <div className="text-sm text-red-600 mb-4">{error}</div>
      )}

      {data && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <StatCard 
              label="Total Users" 
              value={data.summary.totalUsers}
              color="blue"
            />
            <StatCard 
              label="Active Users" 
              value={data.summary.activeUsers}
              color="green"
            />
            <StatCard 
              label="Inactive Users" 
              value={data.summary.inactiveUsers}
              color={data.summary.inactiveUsers > 0 ? "orange" : "gray"}
            />
            <StatCard 
              label="Recently Active" 
              value={data.summary.recentlyActive}
              color="blue"
            />
          </div>

          {/* By Role */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">By Role</h3>
            <div className="space-y-2">
              {Object.entries(data.summary.byRole).map(([role, count]: [string, any]) => (
                <div key={role} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{role}</span>
                  <span className="font-medium text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* User List (Top 5 by recent activity) */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Most Active (Last 7 Days)</h3>
            {data.users
              .filter((u: any) => u.recentActivityCount > 0)
              .sort((a: any, b: any) => b.recentActivityCount - a.recentActivityCount)
              .slice(0, 5)
              .map((user: any) => (
                <div key={user.id} className="text-sm flex items-center justify-between">
                  <div>
                    <span className="text-gray-900 font-medium">{user.name}</span>
                    <span className="text-gray-500 text-xs ml-2">({user.role})</span>
                  </div>
                  <span className="text-gray-700">{user.recentActivityCount} actions</span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// SYSTEM ERRORS PANEL
// ============================================================================

async function SystemErrorsPanel() {
  let data;
  let error;

  try {
    const { prisma } = await import('@/lib/db/prisma');
    
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - 24);

    const events = await prisma.activityLog.findMany({
      where: {
        createdAt: {
          gte: startDate
        },
        OR: [
          { action: 'AUTH_LOGIN_FAILURE' },
          { tags: { string_contains: 'shortage' } },
          { tags: { string_contains: 'risk' } },
          { tags: { string_contains: 'error' } },
          { tags: { string_contains: 'failed' } }
        ]
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });

    const summary = {
      totalEvents: events.length,
      authFailures: events.filter(e => e.action === 'AUTH_LOGIN_FAILURE').length,
      shortageEvents: events.filter(e => 
        e.tags && JSON.stringify(e.tags).includes('shortage')
      ).length,
      riskEvents: events.filter(e => 
        e.tags && JSON.stringify(e.tags).includes('risk')
      ).length,
      errorEvents: events.filter(e => 
        e.tags && (JSON.stringify(e.tags).includes('error') || JSON.stringify(e.tags).includes('failed'))
      ).length
    };

    data = { events, summary };
  } catch (err) {
    error = 'Failed to load system errors';
    console.error('[SecurityDashboard] System errors error:', err);
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        System Errors (Last 24h)
      </h2>

      {error && (
        <div className="text-sm text-red-600 mb-4">{error}</div>
      )}

      {data && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <StatCard 
              label="Auth Failures" 
              value={data.summary.authFailures}
              color={data.summary.authFailures > 0 ? "red" : "gray"}
            />
            <StatCard 
              label="Shortage Events" 
              value={data.summary.shortageEvents}
              color={data.summary.shortageEvents > 0 ? "orange" : "gray"}
            />
            <StatCard 
              label="Risk Events" 
              value={data.summary.riskEvents}
              color={data.summary.riskEvents > 0 ? "orange" : "gray"}
            />
            <StatCard 
              label="Error Events" 
              value={data.summary.errorEvents}
              color={data.summary.errorEvents > 0 ? "red" : "gray"}
            />
          </div>

          {/* Recent Events */}
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {data.events.length === 0 && (
              <p className="text-sm text-gray-500 italic">No system errors in the last 24 hours</p>
            )}
            {data.events.slice(0, 8).map((event: any) => (
              <div key={event.id} className="text-sm border-l-2 border-red-300 pl-3 py-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-red-700">
                    {event.action}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-gray-600 mt-1">{event.summary}</div>
                {event.entityType && (
                  <div className="text-xs text-gray-500 mt-1">
                    Entity: {event.entityType}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

function StatCard({ 
  label, 
  value, 
  color = "gray" 
}: { 
  label: string; 
  value: number; 
  color?: "gray" | "blue" | "green" | "red" | "orange";
}) {
  const colorClasses = {
    gray: "bg-gray-100 text-gray-900",
    blue: "bg-blue-100 text-blue-900",
    green: "bg-green-100 text-green-900",
    red: "bg-red-100 text-red-900",
    orange: "bg-orange-100 text-orange-900"
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm mt-1">{label}</div>
    </div>
  );
}

