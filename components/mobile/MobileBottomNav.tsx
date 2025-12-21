'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, QrCode, CheckSquare, Package, MoreHorizontal } from 'lucide-react';

// Analytics hook placeholder - wire to real analytics later
function trackEvent(event: string, data?: Record<string, unknown>) {
  // TODO: Wire to analytics service
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics]', event, data);
  }
}

interface NavTab {
  id: string;
  label: string;
  href: string;
  icon: typeof Home;
}

const tabs: NavTab[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/ops/dashboard', icon: Home },
  { id: 'scan', label: 'Scan', href: '/ops/m/scan', icon: QrCode },
  { id: 'work', label: 'Work', href: '/ops/production-runs/my-work', icon: CheckSquare },
  { id: 'inventory', label: 'Inventory', href: '/ops/inventory', icon: Package },
  { id: 'more', label: 'More', href: '/ops/settings', icon: MoreHorizontal },
];

/**
 * Mobile bottom navigation - 5 tabs
 * 
 * - Glass background with blur
 * - Fixed to bottom with safe-area padding
 * - 44px minimum touch targets
 * - Selected state: blue icon + subtle glow
 */
export function MobileBottomNav() {
  const pathname = usePathname();

  const isActive = (tab: NavTab) => {
    // Dashboard is active on /ops or /ops/dashboard
    if (tab.id === 'dashboard') {
      return pathname === '/ops' || pathname === '/ops/dashboard';
    }
    // More is active on /ops/settings
    if (tab.id === 'more') {
      return pathname === '/ops/settings' || pathname.startsWith('/ops/settings/');
    }
    // All other tabs: active if pathname starts with their href
    return pathname.startsWith(tab.href);
  };

  const handleTabClick = (tab: NavTab) => {
    trackEvent('nav_tap', { tab: tab.id, from: pathname });
  };

  return (
    <nav 
      className="
        fixed bottom-0 left-0 right-0 z-50
        surface-glass
        border-t border-white/20
      "
      style={{
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
      }}
    >
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const active = isActive(tab);
          const Icon = tab.icon;
          
          return (
            <Link
              key={tab.id}
              href={tab.href}
              onClick={() => handleTabClick(tab)}
              className={`
                flex flex-col items-center justify-center
                min-w-[64px] min-h-[44px]
                py-1 px-2
                rounded-lg
                transition-all duration-[var(--transition-fast)]
                ${active 
                  ? 'text-blue-600' 
                  : 'text-gray-500 active:text-gray-700 active:bg-gray-100/30'
                }
              `}
              aria-current={active ? 'page' : undefined}
            >
              <Icon 
                className={`
                  w-6 h-6 mb-0.5
                  ${active ? 'drop-shadow-[0_0_6px_rgba(59,130,246,0.4)]' : ''}
                `} 
              />
              <span className={`text-[10px] font-medium ${active ? 'font-semibold' : ''}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

