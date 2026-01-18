'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Settings,
  Shield,
  QrCode,
  Activity,
  Users,
  Dna,
  Building2,
  HelpCircle,
  X,
  ChevronRight,
  Link as LinkIcon
} from 'lucide-react';

interface MobileMoreSheetProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: string;
}

interface MenuItem {
  href: string;
  label: string;
  icon: typeof Settings;
  description: string;
  adminOnly?: boolean;
  repAllowed?: boolean;
}

const menuItems: MenuItem[] = [
  {
    href: '/ops/catalog-links',
    label: 'Catalog Links',
    icon: LinkIcon,
    description: 'Retailer sales catalogs',
    adminOnly: false,
    repAllowed: true
  },
  {
    href: '/ops/settings',
    label: 'Settings',
    icon: Settings,
    description: 'System configuration',
    adminOnly: true
  },
  { 
    href: '/ops/qr/redirects', 
    label: 'QR Redirects', 
    icon: QrCode, 
    description: 'Manage QR redirect rules',
    adminOnly: true
  },
  { 
    href: '/ops/qr/fallback', 
    label: 'QR Defaults', 
    icon: QrCode, 
    description: 'Default redirect behavior',
    adminOnly: true
  },
  { 
    href: '/ops/transparency', 
    label: 'Transparency', 
    icon: Shield, 
    description: 'Product transparency records',
    adminOnly: true
  },
  { 
    href: '/ops/security', 
    label: 'Security', 
    icon: Shield, 
    description: 'Access controls',
    adminOnly: true
  },
  { 
    href: '/ops/users', 
    label: 'Users', 
    icon: Users, 
    description: 'User management',
    adminOnly: true
  },
  { 
    href: '/ops/activity', 
    label: 'Activity', 
    icon: Activity, 
    description: 'System activity log'
  },
  { 
    href: '/ops/strains', 
    label: 'Strains', 
    icon: Dna, 
    description: 'Strain registry'
  },
  { 
    href: '/ops/vendors', 
    label: 'Vendors', 
    icon: Building2, 
    description: 'Vendor management'
  },
  { 
    href: '/ops/help', 
    label: 'Help', 
    icon: HelpCircle, 
    description: 'Documentation & support'
  },
];

export function MobileMoreSheet({ isOpen, onClose, userRole }: MobileMoreSheetProps) {
  const pathname = usePathname();
  const [isAnimating, setIsAnimating] = useState(false);

  // Handle animation states
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
    }
  }, [isOpen]);

  // Filter items based on user role
  const visibleItems = menuItems.filter(item => {
    if (userRole === 'ADMIN') return true;
    if (userRole === 'REP') return item.repAllowed && !item.adminOnly;
    return !item.adminOnly;
  });

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen && !isAnimating) return null;

  const handleTransitionEnd = () => {
    if (!isOpen) {
      setIsAnimating(false);
    }
  };

  const handleItemClick = () => {
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`
          fixed inset-0 z-40 bg-black/30 backdrop-blur-sm
          transition-opacity duration-300
          ${isOpen ? 'opacity-100' : 'opacity-0'}
        `}
        onClick={onClose}
        onTransitionEnd={handleTransitionEnd}
      />
      
      {/* Sheet */}
      <div 
        className={`
          fixed bottom-0 left-0 right-0 z-50
          bg-white/95 backdrop-blur-xl
          rounded-t-2xl shadow-2xl
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}
          max-h-[80vh] overflow-hidden
        `}
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">More</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Menu Items */}
        <div className="overflow-y-auto max-h-[60vh] py-2">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleItemClick}
                className={`
                  flex items-center gap-4 px-4 py-3
                  transition-colors
                  ${isActive 
                    ? 'bg-blue-50' 
                    : 'hover:bg-gray-50 active:bg-gray-100'
                  }
                `}
              >
                <div className={`
                  p-2 rounded-lg
                  ${isActive ? 'bg-blue-100' : 'bg-gray-100'}
                `}>
                  <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isActive ? 'text-blue-700' : 'text-gray-900'}`}>
                    {item.label}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {item.description}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}

