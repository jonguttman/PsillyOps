import { auth } from '@/lib/auth/auth';
import { getFilteredManual } from '@/lib/services/helpService';

function snippetize(text: string, q: string) {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return text.slice(0, 180).trim();
  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + 140);
  const s = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + s + (end < text.length ? '…' : '');
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return Response.json({ code: 'UNAUTHORIZED', message: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) {
    return Response.json({ results: [] });
  }

  const { sections } = await getFilteredManual(session.user.role);

  // Build parent map (top-level h2)
  const parentById = new Map<string, { id: string; title: string }>();
  let currentTop: { id: string; title: string } | null = null;
  for (const s of sections) {
    if (s.level === 2) currentTop = { id: s.id, title: s.title };
    if (currentTop) parentById.set(s.id, currentTop);
  }

  const matches = sections
    .filter((s) => s.title.toLowerCase().includes(q.toLowerCase()) || s.content.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 50)
    .map((s) => {
      const top = parentById.get(s.id) || { id: s.id, title: s.title };
      const href = s.level === 2 ? `/ops/help/${s.id}` : `/ops/help/${top.id}#${s.id}`;
      return {
        id: s.id,
        title: s.level === 2 ? s.title : `${top.title} → ${s.title}`,
        href,
        snippet: snippetize(s.content.replace(/^#{2,4}\s+/gm, ''), q),
      };
    });

  return Response.json({ results: matches });
}


