import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { isPartnerUser } from '@/lib/auth/rbac';
import { UserRole } from '@prisma/client';
import { getSheetsByPartner } from '@/lib/services/sealSheetService';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils/formatters';

export default async function PartnerSealsPage() {
  const session = await auth();
  
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

  const sheets = await getSheetsByPartner(session.user.partnerId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Seal Sheets</h1>
        <p className="mt-1 text-sm text-gray-600">
          View your assigned seal sheets
        </p>
      </div>

      {sheets.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-sm text-gray-500">No seal sheets assigned yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Seals
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assigned
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sheets.map((sheet) => (
                <tr key={sheet.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDateTime(sheet.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      sheet.status === 'ASSIGNED' 
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {sheet.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {sheet.tokenCount}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {sheet.assignedAt ? formatDateTime(sheet.assignedAt) : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link
                      href={`/partner/seals/${sheet.id}`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

