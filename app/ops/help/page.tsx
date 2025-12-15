import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { getFilteredManual, getAvailableSectionFilters } from '@/lib/services/helpService';
import HelpClient from './HelpClient';

export const metadata = {
  title: 'Help & Documentation | PsillyOps',
  description: 'User manual and documentation for PsillyOps'
};

interface PageProps {
  searchParams: Promise<{ section?: string }>;
}

export default async function HelpPage({ searchParams }: PageProps) {
  const session = await auth();
  
  if (!session) {
    redirect('/login');
  }
  
  const params = await searchParams;
  const role = session.user.role;
  
  // Get filtered manual content based on user role
  const { toc, sections, content } = await getFilteredManual(role);
  
  // Get available section filters
  const sectionFilters = getAvailableSectionFilters(toc);
  
  // Initial section from URL query
  const initialSection = params.section || null;
  
  return (
    <div className="h-[calc(100vh-160px)]">
      <HelpClient
        toc={toc}
        sections={sections}
        content={content}
        sectionFilters={sectionFilters}
        initialSection={initialSection}
        userRole={role}
      />
    </div>
  );
}


