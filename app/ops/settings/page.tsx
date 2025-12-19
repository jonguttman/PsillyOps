// System Settings Page
// Admin-only configuration panel for system-level settings
// Currently includes: Default Redirect (Fallback) configuration

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import DefaultRedirectPanel from './DefaultRedirectPanel';
import { Settings, Shield } from 'lucide-react';

export default async function SettingsPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  // Only ADMIN can access settings
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gray-100 rounded-lg">
          <Settings className="w-6 h-6 text-gray-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
          <p className="text-sm text-gray-600">
            Configure system-wide behavior and defaults
          </p>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="space-y-8">
        {/* QR Redirect Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">QR Code Behavior</h2>
          </div>
          
          <DefaultRedirectPanel initialFallback={fallbackRedirect} />
        </section>
      </div>
    </div>
  );
}

