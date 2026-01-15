/**
 * Labs Registry
 * 
 * Admin page to manage testing labs.
 */

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { FlaskConical, ArrowLeft } from 'lucide-react';
import LabsClient from './LabsClient';

export default async function LabsPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect('/login');
  }

  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  const labs = await prisma.lab.findMany({
    orderBy: { name: 'asc' },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/ops/transparency"
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <FlaskConical className="w-8 h-8 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Labs Registry</h1>
            <p className="text-sm text-gray-500">
              Manage testing laboratories for transparency records
            </p>
          </div>
        </div>
      </div>

      <LabsClient initialLabs={labs} />
    </div>
  );
}
