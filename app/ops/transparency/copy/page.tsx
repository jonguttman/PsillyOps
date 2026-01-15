/**
 * Public Copy Editor
 * 
 * Admin page to edit the public-facing copy for transparency pages.
 */

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTransparencyCopy } from '@/lib/services/transparencyService';
import { FileText, ArrowLeft } from 'lucide-react';
import CopyEditor from './CopyEditor';

export default async function PublicCopyPage() {
  const session = await auth();
  
  if (!session?.user) {
    redirect('/login');
  }

  if (session.user.role !== 'ADMIN') {
    redirect('/ops/dashboard');
  }

  const copy = await getTransparencyCopy();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/ops/transparency"
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3">
          <FileText className="w-8 h-8 text-green-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Public Copy</h1>
            <p className="text-sm text-gray-500">
              Edit the text displayed on public transparency pages
            </p>
          </div>
        </div>
      </div>

      <CopyEditor initialCopy={copy} />
    </div>
  );
}
