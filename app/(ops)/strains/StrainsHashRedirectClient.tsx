'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Backward-compat for old links like `/strains#add-strain`.
 * Hash is only available client-side, so we redirect on mount.
 */
export default function StrainsHashRedirectClient() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#add-strain') return;

    const search = window.location.search || '';
    router.replace(`/strains/new${search}`);
  }, [router]);

  return null;
}

