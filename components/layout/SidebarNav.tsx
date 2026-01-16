'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarSection } from './SidebarSection';
import {
  LayoutDashboard,
  Package,
  Boxes,
  Warehouse,
  Factory,
  ShoppingCart,
  FileText,
  Tags,
  QrCode,
  ScanLine,
  ListChecks,
  Dna,
  Building2,
  Activity,
  HelpCircle,
  Users,
  Shield,
  Settings,
  LucideIcon,
  ArrowRightLeft,
  BarChart3,
  CircleDot,
  FlaskConical
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
}

function NavItem({ href, label, icon: Icon, isActive }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
        isActive
          ? 'bg-blue-50 text-blue-700 font-medium'
          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-gray-500'}`} />
      <span>{label}</span>
    </Link>
  );
}

interface SidebarNavProps {
  userRole: string;
}

export function SidebarNav({ userRole }: SidebarNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/ops/dashboard') {
      return pathname === '/ops/dashboard' || pathname === '/ops' || pathname === '/';
    }
    // Special handling for QR section to avoid conflicts
    if (href === '/ops/qr/redirects') {
      return pathname.startsWith('/ops/qr/redirects');
    }
    if (href === '/ops/qr/fallback') {
      return pathname === '/ops/qr/fallback';
    }
    // Special handling for Insights section
    if (href === '/ops/insights/tripdar') {
      return pathname.startsWith('/ops/insights/tripdar');
    }
    return pathname.startsWith(href);
  };

  // OPS section - Physical operations
  const opsItems: NavItem[] = [
    { href: '/ops/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/ops/scan', label: 'Scan QR', icon: ScanLine },
    { href: '/ops/products', label: 'Products', icon: Package },
    { href: '/ops/batches', label: 'Batches', icon: FlaskConical },
    { href: '/ops/materials', label: 'Materials', icon: Boxes },
    { href: '/ops/inventory', label: 'Inventory', icon: Warehouse },
    { href: '/ops/production', label: 'Production', icon: Factory },
    { href: '/ops/production-runs', label: 'Production Runs', icon: ListChecks },
    { href: '/ops/production-runs/my-work', label: 'My Work', icon: ListChecks },
    { href: '/ops/orders', label: 'Orders', icon: ShoppingCart },
    { href: '/ops/purchase-orders', label: 'Purchasing', icon: FileText },
  ];

  // LABELS section - Label templates
  const labelsItems: NavItem[] = [
    { href: '/ops/labels', label: 'Templates', icon: Tags },
    { href: '/ops/seals', label: 'TripDAR Seals', icon: Shield },
  ];

  // QR section - QR code management (ADMIN only)
  const qrItems: NavItem[] = userRole === 'ADMIN' ? [
    { href: '/ops/qr/redirects', label: 'Redirects', icon: ArrowRightLeft },
    { href: '/ops/qr/fallback', label: 'Defaults', icon: QrCode },
  ] : [];

  // Insights section - Experience data (ADMIN + ANALYST)
  const insightsItems: NavItem[] = (userRole === 'ADMIN' || userRole === 'ANALYST') ? [
    { href: '/ops/insights/tripdar', label: 'TripDAR', icon: BarChart3 },
  ] : [];

  // Mobile tools - lightweight pages for phone workflows
  const mobileItems: NavItem[] = [
    { href: '/ops/m/scan', label: 'Scan (mobile)', icon: ScanLine },
  ];

  // SYSTEM section - Governance
  const systemItems: NavItem[] = [
    { href: '/ops/activity', label: 'Activity', icon: Activity },
    ...(userRole === 'ADMIN' ? [{ href: '/ops/settings', label: 'Settings', icon: Settings }] : []),
    ...(userRole === 'ADMIN' ? [{ href: '/ops/security', label: 'Security', icon: Shield }] : []),
    ...(userRole === 'ADMIN' ? [{ href: '/ops/users', label: 'Users', icon: Users }] : []),
    ...(userRole === 'ADMIN' ? [{ href: '/ops/transparency', label: 'Transparency', icon: Shield }] : []),
    ...(userRole === 'ADMIN' ? [{ href: '/ops/system/seals', label: 'Seal Config', icon: CircleDot }] : []),
    { href: '/ops/strains', label: 'Strains', icon: Dna },
    { href: '/ops/vendors', label: 'Vendors', icon: Building2 },
    { href: '/ops/help', label: 'Help', icon: HelpCircle },
  ];

  return (
    <nav className="w-56 bg-white border-r border-gray-200 h-full overflow-y-auto py-4 px-2">
      {/* OPS - Physical operations */}
      <SidebarSection title="Ops" defaultExpanded={true} persistKey="ops">
        {opsItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            isActive={isActive(item.href)}
          />
        ))}
      </SidebarSection>

      {/* LABELS - Label templates */}
      <SidebarSection title="Labels" defaultExpanded={false} persistKey="labels">
        {labelsItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            isActive={isActive(item.href)}
          />
        ))}
      </SidebarSection>

      {/* QR - QR code management (only show if there are items) */}
      {qrItems.length > 0 && (
        <SidebarSection title="QR" defaultExpanded={false} persistKey="qr">
          {qrItems.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={isActive(item.href)}
            />
          ))}
        </SidebarSection>
      )}

      {/* INSIGHTS - Experience data (only show if there are items) */}
      {insightsItems.length > 0 && (
        <SidebarSection title="Insights" defaultExpanded={false} persistKey="insights">
          {insightsItems.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={isActive(item.href)}
            />
          ))}
        </SidebarSection>
      )}

      {/* MOBILE TOOLS */}
      <SidebarSection title="Mobile Tools" defaultExpanded={false} persistKey="mobile-tools">
        {mobileItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            isActive={isActive(item.href)}
          />
        ))}
      </SidebarSection>

      {/* SYSTEM - Governance */}
      <SidebarSection title="System" defaultExpanded={false} persistKey="system">
        {systemItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            isActive={isActive(item.href)}
          />
        ))}
      </SidebarSection>
    </nav>
  );
}
