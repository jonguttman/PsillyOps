// QR Default Redirect Page
// Admin-only configuration for the system-level fallback redirect
// Used only when no product or batch redirect rule matches

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import DefaultRedirectPanel from './DefaultRedirectPanel';
import { QrCode, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default async function QRFallbackPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  // Only ADMIN can access QR fallback settings
  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  // Fetch current fallback redirect configuration
  const fallbackRedirect = await prisma.qRRedirectRule.findFirst({
    where: { isFallback: true },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true }
      }
    }
  });

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/ops/qr/redirects" className="hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          QR Redirect Rules
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg">
          <QrCode className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">QR Default Redirect</h1>
          <p className="text-sm text-gray-600">
            Fallback behavior when no product- or batch-specific rule exists
          </p>
        </div>
      </div>

      {/* Main Panel */}
      <DefaultRedirectPanel initialFallback={fallbackRedirect} />
    </div>
  );
}

