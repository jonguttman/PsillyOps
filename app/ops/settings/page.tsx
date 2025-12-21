// System Settings Hub
// Admin-only page for system-wide configuration
// Links to policy and behavior settings, not operational entities

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import Link from 'next/link';
import { 
  Settings, 
  QrCode, 
  Shield, 
  Bell, 
  Sliders,
  FileCheck,
  ChevronRight,
  Check,
  X
} from 'lucide-react';

export default async function SettingsPage() {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/login');
  }

  // Only ADMIN can access settings
  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  // Fetch status indicators for settings
  const [fallbackRedirect, transparencyRecordCount] = await Promise.all([
    prisma.qRRedirectRule.findFirst({
      where: { isFallback: true },
      select: { active: true, redirectUrl: true }
    }),
    prisma.transparencyRecord.count()
  ]);

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
            Configure system-wide behavior, policies, and defaults
          </p>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* QR Defaults - Active */}
        <SettingsCard
          href="/ops/qr/fallback"
          icon={QrCode}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          title="QR Defaults"
          description="Default redirect behavior for unmatched QR scans"
          status={fallbackRedirect?.active ? 'configured' : 'not-configured'}
          statusText={fallbackRedirect?.active ? 'Configured' : 'Not configured'}
        />

        {/* Transparency - Active */}
        <SettingsCard
          href="/ops/transparency"
          icon={Shield}
          iconBg="bg-green-100"
          iconColor="text-green-600"
          title="Transparency"
          description="Product transparency records and lab testing data"
          status={transparencyRecordCount > 0 ? 'configured' : 'not-configured'}
          statusText={`${transparencyRecordCount} records`}
        />

        {/* Security - Active */}
        <SettingsCard
          href="/ops/security"
          icon={Shield}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
          title="Security"
          description="Access controls and security settings"
          status="configured"
          statusText="Active"
        />

        {/* Notifications - Coming Soon */}
        <SettingsCard
          href="#"
          icon={Bell}
          iconBg="bg-gray-100"
          iconColor="text-gray-400"
          title="Notifications"
          description="Email and in-app notification preferences"
          status="coming-soon"
          statusText="Coming soon"
          disabled
        />

        {/* Defaults - Coming Soon */}
        <SettingsCard
          href="#"
          icon={Sliders}
          iconBg="bg-gray-100"
          iconColor="text-gray-400"
          title="Defaults"
          description="Default units, timezone, and display preferences"
          status="coming-soon"
          statusText="Coming soon"
          disabled
        />

        {/* Compliance - Coming Soon */}
        <SettingsCard
          href="#"
          icon={FileCheck}
          iconBg="bg-gray-100"
          iconColor="text-gray-400"
          title="Compliance"
          description="Regulatory settings and audit configuration"
          status="coming-soon"
          statusText="Coming soon"
          disabled
        />
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800">About System Settings</h3>
        <div className="mt-2 text-sm text-blue-700">
          <p>
            System Settings control how PsillyOps behaves across your entire organization. 
            These are policy-level configurations, not operational data.
          </p>
          <p className="mt-2">
            For managing entities like Users, Strains, or Vendors, use the dedicated pages in the sidebar.
          </p>
        </div>
      </div>
    </div>
  );
}

interface SettingsCardProps {
  href: string;
  icon: typeof Settings;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  status: 'configured' | 'not-configured' | 'coming-soon';
  statusText: string;
  disabled?: boolean;
}

function SettingsCard({
  href,
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  status,
  statusText,
  disabled = false
}: SettingsCardProps) {
  const statusColors = {
    'configured': 'bg-green-100 text-green-700',
    'not-configured': 'bg-amber-100 text-amber-700',
    'coming-soon': 'bg-gray-100 text-gray-500'
  };

  const StatusIcon = status === 'configured' ? Check : status === 'not-configured' ? X : null;

  const content = (
    <div className={`
      bg-white rounded-lg shadow border border-gray-200 p-4
      transition-all
      ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-md hover:border-gray-300 cursor-pointer'}
    `}>
      <div className="flex items-start gap-4">
        <div className={`p-2 rounded-lg ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            {!disabled && (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          
          <div className="mt-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[status]}`}>
              {StatusIcon && <StatusIcon className="w-3 h-3" />}
              {statusText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  if (disabled) {
    return content;
  }

  return (
    <Link href={href}>
      {content}
    </Link>
  );
}
