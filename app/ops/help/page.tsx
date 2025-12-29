export const runtime = "nodejs";

import { auth } from '@/lib/auth/auth';
import { redirect } from 'next/navigation';
import { promises as fs } from 'fs';
import path from 'path';
import { getFilteredManual } from '@/lib/services/helpService';
import HelpShell from './_components/HelpShell';

export default async function HelpPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const role = session.user.role;
  const { toc, sections } = await getFilteredManual(role);

  const topLevel = toc.filter((t) => t.level === 2);

  const pages = [
    { id: 'home', title: 'Overview', href: '/ops/help' },
    ...topLevel.map((t) => ({ id: t.id, title: t.title, href: `/ops/help/${t.id}` })),
  ];

  const manualPath = path.join(process.cwd(), 'docs', 'USER_MANUAL.md');
  const stat = await fs.stat(manualPath);

  // Landing content: show the manual title + role note + quick index
  const landing = [
    '## PsillyOps Help Center',
    '',
    'Use the sidebar to browse sections, or search to jump directly to a procedure.',
    '',
    '### Quick Index',
    '',
    ...topLevel.map((t) => `- [${t.title}](/ops/help/${t.id})`),
    '',
    '---',
    '',
    '### Image Gallery (placeholders)',
    '',
    '> Screenshots are coming soon. This area is reserved for UI walkthrough images (warehouse, production, AI flows, etc.).',
    '',
  ].join('\n');

  return (
    <HelpShell
      title="Help Center"
      subtitle={`Showing documentation for ${role} role`}
      pages={pages}
      content={landing}
      lastUpdatedLabel={`Last updated: ${stat.mtime.toLocaleDateString()}`}
    />
  );
}


