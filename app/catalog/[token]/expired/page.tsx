/**
 * Expired Catalog Landing Page
 *
 * Displays when a catalog link has expired, offering a renewal request form.
 * This page intentionally has a calm, non-error feel.
 */

import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { headers } from 'next/headers';
import { getExpiredCatalogInfo } from '@/lib/services/catalogLinkService';
import { ExpiredCatalogClient } from './ExpiredCatalogClient';

interface PageProps {
  params: Promise<{ token: string }>;
}

export const metadata: Metadata = {
  title: 'Introduction Concluded',
  robots: 'noindex,nofollow,noarchive,nosnippet'
};

export default async function ExpiredCatalogPage({ params }: PageProps) {
  const { token } = await params;

  // Get expired catalog info (returns null if token doesn't exist or isn't expired)
  const expiredInfo = await getExpiredCatalogInfo(token);

  if (!expiredInfo) {
    notFound();
  }

  // Set noindex header
  const headersList = await headers();

  return (
    <>
      {/* Additional meta tag for robots */}
      <meta name="robots" content="noindex,nofollow,noarchive,nosnippet" />

      <ExpiredCatalogClient
        token={token}
        retailerId={expiredInfo.retailerId}
        retailerName={expiredInfo.retailerName}
      />
    </>
  );
}
