'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import TableOfContents from '@/components/help/TableOfContents';
import SectionFilter from '@/components/help/SectionFilter';
import MarkdownRenderer from '@/components/help/MarkdownRenderer';
import type { TOCItem, Section } from '@/lib/services/helpService';

interface HelpClientProps {
  toc: TOCItem[];
  sections: Section[];
  content: string;
  sectionFilters: { id: string; title: string }[];
  initialSection: string | null;
  userRole: string;
}

export default function HelpClient({
  toc,
  sections,
  content,
  sectionFilters,
  initialSection,
  userRole
}: HelpClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [selectedSection, setSelectedSection] = useState<string | null>(initialSection);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Filter content based on selected section
  const filteredContent = useCallback(() => {
    if (!selectedSection) {
      return content;
    }
    
    // Find the section and all its children
    const sectionIndex = sections.findIndex(s => s.id === selectedSection);
    if (sectionIndex === -1) return content;
    
    const section = sections[sectionIndex];
    const contentParts: string[] = [section.content];
    
    // Include child sections
    for (let i = sectionIndex + 1; i < sections.length; i++) {
      const nextSection = sections[i];
      if (nextSection.level <= section.level) {
        break;
      }
      contentParts.push(nextSection.content);
    }
    
    return contentParts.join('\n');
  }, [selectedSection, sections, content]);
  
  // Handle section filter change
  const handleSectionChange = (sectionId: string | null) => {
    setSelectedSection(sectionId);
    
    // Update URL without full page reload
    const params = new URLSearchParams(searchParams.toString());
    if (sectionId) {
      params.set('section', sectionId);
    } else {
      params.delete('section');
    }
    router.push(`/help?${params.toString()}`, { scroll: false });
    
    // Scroll to top of content area
    const contentArea = document.getElementById('help-content-area');
    if (contentArea) {
      contentArea.scrollTop = 0;
    }
  };
  
  // Handle TOC item click
  const handleTocClick = (sectionId: string) => {
    // Find the heading element and scroll to it
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setActiveHeading(sectionId);
  };
  
  // Track scroll position to highlight active heading
  useEffect(() => {
    const contentArea = document.getElementById('help-content-area');
    if (!contentArea) return;
    
    const handleScroll = () => {
      const headings = contentArea.querySelectorAll('h2[id], h3[id], h4[id]');
      let currentActive: string | null = null;
      
      headings.forEach((heading) => {
        const rect = heading.getBoundingClientRect();
        if (rect.top <= 150) {
          currentActive = heading.id;
        }
      });
      
      if (currentActive !== activeHeading) {
        setActiveHeading(currentActive);
      }
    };
    
    contentArea.addEventListener('scroll', handleScroll);
    return () => contentArea.removeEventListener('scroll', handleScroll);
  }, [activeHeading]);
  
  // Handle initial hash navigation
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash.slice(1);
      setTimeout(() => {
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          setActiveHeading(hash);
        }
      }, 100);
    }
  }, []);
  
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 hover:bg-gray-100 rounded-md lg:hidden"
            aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            <svg 
              className="w-5 h-5 text-gray-500" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 6h16M4 12h16M4 18h16" 
              />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Help & Documentation</h1>
            <p className="text-sm text-gray-500">
              Showing documentation for <span className="font-medium">{userRole}</span> role
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <SectionFilter
            filters={sectionFilters}
            selected={selectedSection}
            onChange={handleSectionChange}
          />
        </div>
      </div>
      
      {/* Main content area */}
      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Sidebar TOC */}
        <aside 
          className={`
            ${sidebarCollapsed ? 'hidden' : 'block'} 
            lg:block w-64 flex-shrink-0 overflow-y-auto
            bg-white border border-gray-200 rounded-lg p-4
          `}
        >
          <div className="sticky top-0 bg-white pb-2 mb-2 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
              Contents
            </h2>
          </div>
          <TableOfContents
            items={toc}
            activeHeading={activeHeading}
            onItemClick={handleTocClick}
            selectedSection={selectedSection}
          />
        </aside>
        
        {/* Content area */}
        <main 
          id="help-content-area"
          className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-lg p-6"
        >
          <article className="prose prose-slate max-w-none">
            <MarkdownRenderer content={filteredContent()} />
          </article>
        </main>
      </div>
    </div>
  );
}


