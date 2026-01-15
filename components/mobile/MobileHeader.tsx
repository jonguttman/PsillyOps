'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, User } from 'lucide-react';

interface MobileHeaderProps {
  showBack?: boolean;
  backHref?: string;
  title?: string;
}

/**
 * Minimal mobile header
 * 
 * - Logo centered (or title if provided)
 * - Glass background, translucent
 * - Safe-area padding for notched devices
 * - Optional back button for sub-pages
 * - Profile button routes to More/account
 */
export function MobileHeader({ 
  showBack = false, 
  backHref,
  title 
}: MobileHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <header 
      className="
        fixed top-0 left-0 right-0 z-50
        surface-glass
        pt-[env(safe-area-inset-top)]
      "
    >
      <div className="flex items-center justify-between h-14 px-4">
        {/* Left: Back button or spacer */}
        <div className="w-10 flex items-center">
          {showBack && (
            <button
              onClick={handleBack}
              className="
                flex items-center justify-center
                w-10 h-10 -ml-2
                rounded-full
                text-gray-600
                active:bg-gray-100/50
                transition-colors duration-[var(--transition-fast)]
              "
              aria-label="Go back"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Center: Logo or title */}
        <div className="flex-1 flex items-center justify-center">
          {title ? (
            <h1 className="text-base font-semibold text-gray-900 truncate">
              {title}
            </h1>
          ) : (
            <Link href="/ops/dashboard" className="flex items-center gap-2">
              <Image
                src="/PsillyMark-2026.svg"
                alt="PsillyOps"
                width={24}
                height={24}
                priority
              />
              <span className="text-lg font-bold text-gray-900">PsillyOps</span>
            </Link>
          )}
        </div>

        {/* Right: Profile button */}
        <div className="w-10 flex items-center justify-end">
          <Link
            href="/ops"
            className="
              flex items-center justify-center
              w-10 h-10 -mr-2
              rounded-full
              text-gray-500
              active:bg-gray-100/50
              transition-colors duration-[var(--transition-fast)]
            "
            aria-label="Account and settings"
          >
            <User className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

