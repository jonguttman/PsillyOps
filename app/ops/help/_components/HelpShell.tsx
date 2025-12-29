'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import MarkdownRenderer from '@/components/help/MarkdownRenderer';

type PageLink = { id: string; title: string; href: string };

type SearchResult = {
  id: string;
  title: string;
  href: string;
  snippet: string;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export default function HelpShell({
  title,
  subtitle,
  pages,
  content,
  lastUpdatedLabel,
}: {
  title: string;
  subtitle?: string;
  pages: PageLink[];
  content: string;
  lastUpdatedLabel?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activePageId = useMemo(() => {
    const slug = pathname.split('/ops/help/')[1];
    if (!slug) return null;
    return slug.split('#')[0].split('?')[0] || null;
  }, [pathname]);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Search: server-backed (role aware), no extra dependencies
  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setSearchLoading(false);
      return;
    }

    const run = async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/help/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled) setResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    };

    const t = setTimeout(run, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  return (
    <div className="min-h-[calc(100vh-160px)]">
      {/* Banner: internal-only */}
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="font-medium">Internal Help Center</div>
        <div className="text-amber-800">
          This documentation is for internal Ops use. It is accessible at <span className="font-mono">/ops/help</span>.
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left sidebar */}
        <aside className="hidden lg:block w-72 flex-shrink-0">
          <div className="sticky top-6">
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Help</div>
                <div className="mt-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search docs…"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <div className="mt-1 text-xs text-gray-500">
                    {searchLoading ? 'Searching…' : results ? `${results.length} result(s)` : 'Search all sections'}
                  </div>
                </div>
              </div>

              {/* Search results */}
              {results && (
                <div className="max-h-[50vh] overflow-y-auto px-2 py-2">
                  {results.length === 0 ? (
                    <div className="px-2 py-2 text-sm text-gray-600">No results.</div>
                  ) : (
                    <div className="space-y-1">
                      {results.slice(0, 30).map((r) => (
                        <Link
                          key={r.href}
                          href={r.href}
                          className="block rounded-md px-2 py-2 hover:bg-gray-50"
                          onClick={() => {
                            // Clear query so nav list becomes visible again if desired
                            setQuery('');
                          }}
                        >
                          <div className="text-sm font-medium text-gray-900">{r.title}</div>
                          <div className="mt-0.5 text-xs text-gray-600 line-clamp-2">{r.snippet}</div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Page nav */}
              {!results && (
                <nav className="max-h-[70vh] overflow-y-auto px-2 py-2">
                  {pages.map((p) => {
                    const isActive = activePageId ? p.href.startsWith(`/ops/help/${activePageId}`) : p.href === '/ops/help';
                    return (
                      <Link
                        key={p.href}
                        href={p.href}
                        className={cx(
                          'flex items-center rounded-md px-3 py-2 text-sm',
                          isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                        )}
                      >
                        {p.title}
                      </Link>
                    );
                  })}
                </nav>
              )}
            </div>
          </div>
        </aside>

        {/* Main content + right TOC */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-gray-600">{subtitle}</p> : null}
              {lastUpdatedLabel ? <p className="mt-1 text-xs text-gray-500">{lastUpdatedLabel}</p> : null}
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.refresh()}
                className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50"
              >
                Refresh
              </button>
              <Link
                href="/ops/help"
                className="inline-flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 hover:bg-gray-100"
              >
                Help Home
              </Link>
            </div>
          </div>

          <div className="mt-6 flex gap-6">
            <main
              id="help-content-area"
              className="flex-1 rounded-lg border border-gray-200 bg-white p-6 overflow-y-auto max-h-[calc(100vh-260px)]"
            >
              <article id="help-article" className="prose prose-slate max-w-none">
                <MarkdownRenderer content={content} />
              </article>
            </main>

            <aside className="hidden xl:block w-72 flex-shrink-0">
              <HelpRightToc />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function HelpRightToc() {
  const [items, setItems] = useState<Array<{ id: string; text: string; level: number }>>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const container = document.getElementById('help-content-area');
    const article = document.getElementById('help-article');
    if (!container || !article) return;

    const headings = Array.from(article.querySelectorAll('h2[id], h3[id], h4[id]')) as HTMLElement[];
    const nextItems = headings
      .map((h) => ({
        id: h.id,
        text: h.textContent?.replace(/\s+#\s*$/, '').trim() || h.id,
        level: h.tagName === 'H2' ? 2 : h.tagName === 'H3' ? 3 : 4,
      }))
      // GitBook-like: right TOC mostly for within-page (h3/h4), but keep h2 anchors too
      .filter((x) => x.text);
    setItems(nextItems);

    const onScroll = () => {
      const current = headings
        .filter((h) => {
          const r = h.getBoundingClientRect();
          return r.top <= 140;
        })
        .pop();
      setActiveId(current?.id || null);
    };

    container.addEventListener('scroll', onScroll);
    onScroll();
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="sticky top-6 rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">On this page</div>
      <nav className="mt-3 space-y-1">
        {items.map((it) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            className={cx(
              'block rounded px-2 py-1 text-sm',
              it.level === 3 && 'pl-5 text-[13px]',
              it.level === 4 && 'pl-8 text-[13px]',
              activeId === it.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
            )}
            onClick={(e) => {
              e.preventDefault();
              const el = document.getElementById(it.id);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {it.text}
          </a>
        ))}
      </nav>
    </div>
  );
}


