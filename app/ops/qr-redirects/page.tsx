// QR Redirect Rules Management Page
// Admin-only page for viewing and managing QR redirect rules

import { prisma } from '@/lib/db/prisma';
import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { deactivateRedirectRule, countAffectedTokens } from '@/lib/services/qrRedirectService';
import { AlertTriangle, Clock, ExternalLink, Plus, XCircle, Shield, Settings } from 'lucide-react';

async function deactivateRule(formData: FormData) {
  'use server';
  
  const session = await auth();
  if (!session || session.user.role !== 'ADMIN') {
    throw new Error('Unauthorized');
  }
  
  const ruleId = formData.get('ruleId') as string;
  await deactivateRedirectRule(ruleId, session.user.id);
  
  revalidatePath('/ops/qr-redirects');
}

export default async function QRRedirectsPage({
  searchParams
}: {
  searchParams: Promise<{ 
    showInactive?: string;
    scopeType?: string;
    domain?: string;
  }>
}) {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  // Only ADMIN can manage redirect rules
  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  const params = await searchParams;
  const showInactive = params.showInactive === 'true';
  const scopeFilter = params.scopeType || '';
  const domainFilter = params.domain || '';

  // Build where clause with filters
  // Always exclude fallback rules from the normal list - they're managed in Settings
  const whereClause: any = {
    isFallback: false
  };
  if (!showInactive) {
    whereClause.active = true;
  }
  if (scopeFilter) {
    if (scopeFilter === 'VERSION') {
      whereClause.versionId = { not: null };
    } else {
      whereClause.entityType = scopeFilter;
    }
  }
  if (domainFilter) {
    whereClause.redirectUrl = { contains: domainFilter };
  }

  // Fetch redirect rules (excluding fallback)
  const rules = await prisma.qRRedirectRule.findMany({
    where: whereClause,
    include: {
      createdBy: {
        select: { id: true, name: true, email: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Fetch the fallback redirect separately for status indicator
  const fallbackRedirect = await prisma.qRRedirectRule.findFirst({
    where: { isFallback: true }
  });

  // Get affected token counts for each rule
  const rulesWithCounts = await Promise.all(
    rules.map(async (rule) => {
      const affectedTokens = await countAffectedTokens({
        entityType: rule.entityType,
        entityId: rule.entityId,
        versionId: rule.versionId
      });
      
      // Get entity name for display
      let entityName = '';
      let entityLink = '';
      if (rule.entityType && rule.entityId) {
        if (rule.entityType === 'PRODUCT') {
          const product = await prisma.product.findUnique({
            where: { id: rule.entityId },
            select: { name: true, sku: true }
          });
          entityName = product ? `${product.name} (${product.sku})` : rule.entityId;
          entityLink = `/ops/products/${rule.entityId}`;
        } else if (rule.entityType === 'BATCH') {
          const batch = await prisma.batch.findUnique({
            where: { id: rule.entityId },
            select: { batchCode: true }
          });
          entityName = batch ? batch.batchCode : rule.entityId;
          entityLink = `/ops/batches/${rule.entityId}`;
        } else if (rule.entityType === 'INVENTORY') {
          entityName = rule.entityId;
          entityLink = `/ops/inventory/${rule.entityId}`;
        } else {
          entityName = rule.entityId;
        }
      } else if (rule.versionId) {
        const version = await prisma.labelTemplateVersion.findUnique({
          where: { id: rule.versionId },
          include: { template: { select: { name: true } } }
        });
        entityName = version ? `${version.template.name} v${version.version}` : rule.versionId;
        entityLink = `/ops/labels`;
      }
      
      return { ...rule, affectedTokens, entityName, entityLink };
    })
  );

  const now = new Date();

  // Check for potential overlapping rules
  const activeRules = rulesWithCounts.filter(r => r.active);
  const overlappingWarnings: string[] = [];
  
  // Group by scope to check for overlaps
  const rulesByScope: Record<string, typeof activeRules> = {};
  for (const rule of activeRules) {
    const scopeKey = rule.entityType 
      ? `${rule.entityType}:${rule.entityId}`
      : `VERSION:${rule.versionId}`;
    if (!rulesByScope[scopeKey]) {
      rulesByScope[scopeKey] = [];
    }
    rulesByScope[scopeKey].push(rule);
  }
  
  for (const [scope, scopeRules] of Object.entries(rulesByScope)) {
    if (scopeRules.length > 1) {
      overlappingWarnings.push(`Multiple active rules for ${scope} - first match wins`);
    }
  }

  // Extract unique domains for filter
  const allDomains = [...new Set(rulesWithCounts.map(r => {
    try {
      return new URL(r.redirectUrl).hostname;
    } catch {
      return null;
    }
  }).filter(Boolean))];

  // Build filter URL helper
  // Check if key exists in newParams (even if undefined) to properly clear filters
  const buildFilterUrl = (newParams: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    
    // If key is explicitly passed (even as undefined), use that value; otherwise keep current
    const showInactiveVal = 'showInactive' in newParams ? newParams.showInactive : (showInactive ? 'true' : undefined);
    const scopeTypeVal = 'scopeType' in newParams ? newParams.scopeType : scopeFilter;
    const domainVal = 'domain' in newParams ? newParams.domain : domainFilter;
    
    if (showInactiveVal) p.set('showInactive', 'true');
    if (scopeTypeVal) p.set('scopeType', scopeTypeVal);
    if (domainVal) p.set('domain', domainVal);
    
    const query = p.toString();
    return query ? `/ops/qr-redirects?${query}` : '/ops/qr-redirects';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QR Redirect Rules</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage group-based redirects for QR code scans
          </p>
        </div>
        <Link
          href="/ops/qr-redirects/new"
          className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Create Rule
        </Link>
      </div>

      {/* Default Redirect Status */}
      <div className={`rounded-lg border p-4 ${
        fallbackRedirect?.active 
          ? 'bg-green-50 border-green-200' 
          : 'bg-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className={`w-5 h-5 ${fallbackRedirect?.active ? 'text-green-600' : 'text-gray-400'}`} />
            <div>
              <h3 className="text-sm font-medium text-gray-900">Default Redirect</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {fallbackRedirect?.active 
                  ? `Active: ${fallbackRedirect.redirectUrl}` 
                  : 'Not configured — unmatched scans use default routing'
                }
              </p>
            </div>
          </div>
          <Link
            href="/ops/settings"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <Settings className="w-4 h-4" />
            {fallbackRedirect ? 'Configure' : 'Set Up'}
          </Link>
        </div>
      </div>

      {/* Warnings */}
      {overlappingWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-amber-800">Potential Overlap Detected</h3>
              <ul className="mt-1 text-sm text-amber-700 list-disc list-inside">
                {overlappingWarnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Stats + Filters */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Stats */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Active Rules</div>
          <div className="text-2xl font-bold text-green-600">
            {rulesWithCounts.filter(r => r.active).length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Total Rules</div>
          <div className="text-2xl font-bold text-gray-900">
            {rulesWithCounts.length}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Affected Tokens</div>
          <div className="text-2xl font-bold text-blue-600">
            {rulesWithCounts.filter(r => r.active).reduce((sum, r) => sum + r.affectedTokens, 0)}
          </div>
        </div>

        {/* Scheduled Rules Count */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-500">Scheduled</div>
          <div className="text-2xl font-bold text-yellow-600">
            {rulesWithCounts.filter(r => r.active && r.startsAt && r.startsAt > now).length}
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg shadow px-4 py-3">
        <span className="text-sm text-gray-500">Filter:</span>
        
        {/* Scope Type Buttons */}
        <div className="flex gap-1">
          {['', 'PRODUCT', 'BATCH', 'INVENTORY', 'VERSION'].map((scope) => (
            <Link
              key={scope || 'all'}
              href={buildFilterUrl({ scopeType: scope || undefined })}
              className={`px-3 py-1 text-xs font-medium rounded-md ${
                scopeFilter === scope
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {scope || 'All'}
            </Link>
          ))}
        </div>

        <span className="text-gray-300">|</span>

        {/* Active Toggle */}
        <Link
          href={buildFilterUrl({ showInactive: showInactive ? undefined : 'true' })}
          className={`px-3 py-1 text-xs font-medium rounded-md ${
            showInactive
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {showInactive ? 'Showing All' : 'Active Only'}
        </Link>

        {/* Domain Filter */}
        {allDomains.length > 1 && (
          <>
            <span className="text-gray-300">|</span>
            <div className="flex gap-1">
              <Link
                href={buildFilterUrl({ domain: undefined })}
                className={`px-2 py-1 text-xs font-medium rounded-md ${
                  !domainFilter
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </Link>
              {allDomains.slice(0, 3).map((domain) => (
                <Link
                  key={domain}
                  href={buildFilterUrl({ domain: domain as string })}
                  className={`px-2 py-1 text-xs font-medium rounded-md truncate max-w-[100px] ${
                    domainFilter === domain
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  title={domain as string}
                >
                  {domain}
                </Link>
              ))}
            </div>
          </>
        )}

        {/* Clear Filters */}
        {(scopeFilter || domainFilter || showInactive) && (
          <Link
            href="/ops/qr-redirects"
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <XCircle className="w-3 h-3" />
            Clear
          </Link>
        )}
      </div>

      {/* Rules Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Scope
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Target
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Destination URL
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Window
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tokens
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rulesWithCounts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center">
                  <div className="text-gray-500">
                    <p className="text-sm">No redirect rules found.</p>
                    <Link
                      href="/ops/qr-redirects/new"
                      className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                    >
                      <Plus className="w-4 h-4" />
                      Create your first rule
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              rulesWithCounts.map((rule) => {
                // Determine effective status
                const isWithinWindow = (
                  (!rule.startsAt || rule.startsAt <= now) &&
                  (!rule.endsAt || rule.endsAt >= now)
                );
                const isScheduled = rule.active && rule.startsAt && rule.startsAt > now;
                const isExpiredWindow = rule.active && rule.endsAt && rule.endsAt < now;
                const isEffectivelyActive = rule.active && isWithinWindow;
                
                return (
                  <tr key={rule.id} className={`hover:bg-gray-50 ${!rule.active ? 'opacity-60' : ''}`}>
                    {/* Scope */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {rule.entityType ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          {rule.entityType}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          VERSION
                        </span>
                      )}
                    </td>

                    {/* Target */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        {rule.entityLink ? (
                          <Link
                            href={rule.entityLink}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800"
                          >
                            {rule.entityName}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-gray-900">
                            {rule.entityName}
                          </span>
                        )}
                        {rule.reason && (
                          <span className="text-xs text-gray-500 mt-0.5">
                            {rule.reason}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Destination URL */}
                    <td className="px-6 py-4">
                      <a 
                        href={rule.redirectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 max-w-[200px]"
                        title={rule.redirectUrl}
                      >
                        <span className="truncate">{rule.redirectUrl}</span>
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      </a>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {isEffectivelyActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : isScheduled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          <Clock className="w-3 h-3" />
                          Scheduled
                        </span>
                      ) : isExpiredWindow ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                          <AlertTriangle className="w-3 h-3" />
                          Expired Window
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          Inactive
                        </span>
                      )}
                    </td>

                    {/* Time Window */}
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                      {rule.startsAt || rule.endsAt ? (
                        <div className="space-y-0.5">
                          {rule.startsAt && (
                            <div>From: {new Date(rule.startsAt).toLocaleDateString()}</div>
                          )}
                          {rule.endsAt && (
                            <div>Until: {new Date(rule.endsAt).toLocaleDateString()}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">Always</span>
                      )}
                    </td>

                    {/* Tokens */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm font-medium text-gray-900">
                        {rule.affectedTokens}
                      </span>
                    </td>

                    {/* Created */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {rule.createdBy?.name || 'System'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(rule.createdAt).toLocaleDateString()}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {rule.active && (
                        <form action={deactivateRule} className="inline">
                          <input type="hidden" name="ruleId" value={rule.id} />
                          <button
                            type="submit"
                            className="text-red-600 hover:text-red-900 text-sm font-medium"
                          >
                            Deactivate
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800">About QR Redirect Rules</h3>
        <div className="mt-2 text-sm text-blue-700">
          <p>Redirect rules allow you to change where QR codes redirect without reprinting labels:</p>
          <ul className="mt-2 list-disc list-inside space-y-1">
            <li><strong>Batch scope</strong>: Redirect all scans for a specific batch (most specific)</li>
            <li><strong>Product scope</strong>: Redirect all scans for a specific product</li>
            <li><strong>Version scope</strong>: Redirect all labels printed from a specific template version</li>
            <li><strong>Time windows</strong>: Schedule redirects for campaigns or temporary changes</li>
          </ul>
          <p className="mt-3 pt-2 border-t border-blue-200">
            <strong>Resolution Order:</strong> Token override → Batch → Product → Version → Default Redirect → No redirect
          </p>
        </div>
      </div>
    </div>
  );
}
