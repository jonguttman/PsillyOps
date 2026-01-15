export const runtime = "nodejs";

import { auth } from '@/lib/auth/auth';
import { notFound, redirect } from 'next/navigation';
import { promises as fs } from 'fs';
import path from 'path';
import { getFilteredManual, getSectionContent } from '@/lib/services/helpService';
import HelpShell from '../_components/HelpShell';

export default async function HelpSectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  const { slug } = await params;
  const role = session.user.role;

  const { toc, sections } = await getFilteredManual(role);
  const topLevel = toc.filter((t) => t.level === 2);

  const exists = sections.some((s) => s.id === slug && s.level === 2);
  if (!exists) notFound();

  const content = getSectionContent(sections, slug);

  const manualPath = path.join(process.cwd(), 'docs', 'USER_MANUAL.md');
  const stat = await fs.stat(manualPath);

  const pages = [
    { id: 'home', title: 'Overview', href: '/ops/help' },
    ...topLevel.map((t) => ({ id: t.id, title: t.title, href: `/ops/help/${t.id}` })),
  ];

  const title = topLevel.find((t) => t.id === slug)?.title ?? 'Help';

  return (
    <HelpShell
      title={title}
      subtitle={`Showing documentation for ${role} role`}
      pages={pages}
      content={content}
      lastUpdatedLabel={`Last updated: ${stat.mtime.toLocaleDateString()}`}
    />
  );
}


