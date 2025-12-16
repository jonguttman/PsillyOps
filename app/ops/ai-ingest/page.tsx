import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { hasPermission } from '@/lib/auth/rbac';
import { listDocumentImports } from '@/lib/services/aiIngestService';
import AiIngestClient from './AiIngestClient';

export default async function AiIngestPage() {
  const session = await auth();
  
  if (!session) {
    redirect('/login');
  }

  // Check permissions
  const canIngest = hasPermission(session.user.role, 'ai', 'ingest');
  const canView = hasPermission(session.user.role, 'ai', 'view');

  if (!canView) {
    redirect('/ops/dashboard');
  }

  // Fetch initial document imports
  const { items: initialImports, total } = await listDocumentImports({ limit: 20 });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">AI Document Ingest</h1>
        <p className="mt-1 text-sm text-gray-500">
          Paste or upload documents to automatically extract and execute commands
        </p>
      </div>

      <AiIngestClient 
        initialImports={initialImports}
        totalCount={total}
        canIngest={canIngest}
      />
    </div>
  );
}
