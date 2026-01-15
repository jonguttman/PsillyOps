import { auth } from '@/lib/auth/auth';
import { redirect, notFound } from 'next/navigation';
import { isPartnerUser } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';
import { getSheetById } from '@/lib/services/sealSheetService';
import { formatDateTime } from '@/lib/utils/formatters';

export default async function PartnerSheetDetailPage({
  params,
}: {
  params: Promise<{ sheetId: string }>;
}) {
  const session = await auth();
  const { sheetId } = await params;

  if (!session?.user || !isPartnerUser(session.user.role as UserRole)) {
    redirect('/partner/login');
  }

  if (!session.user.partnerId) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-800">
          You are not assigned to a partner.
        </p>
      </div>
    );
  }

  try {
    const sheet = await getSheetById(sheetId);

    // Verify sheet belongs to partner
    if (sheet.partnerId !== session.user.partnerId) {
      notFound();
    }

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Seal Sheet Details</h1>
          <p className="mt-1 text-sm text-gray-600">
            Sheet ID: {sheet.id.substring(0, 8)}...
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Status</h3>
            <p className="mt-1 text-sm text-gray-900">{sheet.status}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-500">Created</h3>
            <p className="mt-1 text-sm text-gray-900">{formatDateTime(sheet.createdAt)}</p>
          </div>
          {sheet.assignedAt && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">Assigned</h3>
              <p className="mt-1 text-sm text-gray-900">{formatDateTime(sheet.assignedAt)}</p>
            </div>
          )}
          <div>
            <h3 className="text-sm font-medium text-gray-500">Token Count</h3>
            <p className="mt-1 text-sm text-gray-900">{sheet.tokenCount}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-500">Seal Version</h3>
            <p className="mt-1 text-sm text-gray-900">{sheet.sealVersion}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Tokens</h2>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-500">
              Token list view coming soon. Showing {sheet.tokens.length} of {sheet._count.tokens} tokens.
            </p>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    notFound();
  }
}

