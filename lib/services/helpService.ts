import { promises as fs } from 'fs';
import path from 'path';

// Types for the help system
export interface TOCItem {
  id: string;
  title: string;
  level: number;
  children: TOCItem[];
}

export interface Section {
  id: string;
  title: string;
  level: number;
  content: string;
  startLine: number;
  endLine: number;
}

export interface ParsedManual {
  toc: TOCItem[];
  sections: Section[];
  fullContent: string;
}

// Role to section mapping - determines which sections each role can see
const ROLE_SECTION_MAP: Record<string, string[]> = {
  ADMIN: [
    'Overview',
    'Getting Started',
    'User Roles',
    'Admin Guide',
    'Production Guide',
    'Warehouse Guide',
    'Wholesale Pricing & Invoicing',
    'Sales Rep Guide',
    'Product Management',
    'Feature Tutorials',
    'QR Workflows',
    'AI Tools',
    'Troubleshooting',
    'Glossary',
    'Support'
  ],
  PRODUCTION: [
    'Overview',
    'Getting Started',
    'User Roles',
    'Production Guide',
    'Feature Tutorials',
    'QR Workflows',
    'AI Tools',
    'Troubleshooting',
    'Glossary',
    'Support'
  ],
  WAREHOUSE: [
    'Overview',
    'Getting Started',
    'User Roles',
    'Warehouse Guide',
    'QR Workflows',
    'Troubleshooting',
    'Glossary',
    'Support'
  ],
  REP: [
    'Overview',
    'Getting Started',
    'User Roles',
    'Sales Rep Guide',
    'Wholesale Pricing & Invoicing',
    'Troubleshooting',
    'Glossary',
    'Support'
  ]
};

// Cache the parsed manual to avoid re-reading on every request
let cachedManual: ParsedManual | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Generates a URL-safe ID from a heading title
 */
function generateId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Parses the markdown content and extracts TOC structure and sections
 */
function parseMarkdown(content: string): ParsedManual {
  const lines = content.split('\n');
  const toc: TOCItem[] = [];
  const sections: Section[] = [];
  const tocStack: TOCItem[] = [];
  
  let currentSection: Section | null = null;
  let currentSectionLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{2,4})\s+(.+)$/);
    
    if (headingMatch) {
      // Save the previous section
      if (currentSection) {
        currentSection.content = currentSectionLines.join('\n');
        currentSection.endLine = i - 1;
        sections.push(currentSection);
      }
      
      const level = headingMatch[1].length; // 2, 3, or 4
      const title = headingMatch[2].trim();
      const id = generateId(title);
      
      // Create new section
      currentSection = {
        id,
        title,
        level,
        content: '',
        startLine: i,
        endLine: i
      };
      currentSectionLines = [line];
      
      // Create TOC item
      const tocItem: TOCItem = {
        id,
        title,
        level,
        children: []
      };
      
      // Build TOC hierarchy
      if (level === 2) {
        // Top-level section
        toc.push(tocItem);
        tocStack.length = 0;
        tocStack.push(tocItem);
      } else {
        // Find parent in stack
        while (tocStack.length > 0 && tocStack[tocStack.length - 1].level >= level) {
          tocStack.pop();
        }
        
        if (tocStack.length > 0) {
          tocStack[tocStack.length - 1].children.push(tocItem);
        } else {
          // Orphan heading, add to top level
          toc.push(tocItem);
        }
        tocStack.push(tocItem);
      }
    } else if (currentSection) {
      currentSectionLines.push(line);
    }
  }
  
  // Save the last section
  if (currentSection) {
    currentSection.content = currentSectionLines.join('\n');
    currentSection.endLine = lines.length - 1;
    sections.push(currentSection);
  }
  
  return {
    toc,
    sections,
    fullContent: content
  };
}

/**
 * Reads and parses the USER_MANUAL.md file
 */
export async function getManual(): Promise<ParsedManual> {
  const now = Date.now();
  
  // Return cached version if still valid
  if (cachedManual && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedManual;
  }
  
  // Read the manual file
  const manualPath = path.join(process.cwd(), 'docs', 'USER_MANUAL.md');
  const content = await fs.readFile(manualPath, 'utf-8');
  
  // Parse and cache
  cachedManual = parseMarkdown(content);
  cacheTimestamp = now;
  
  return cachedManual;
}

/**
 * Filters the TOC based on user role
 */
export function filterTOCByRole(toc: TOCItem[], role: string): TOCItem[] {
  const allowedSections = ROLE_SECTION_MAP[role] || ROLE_SECTION_MAP.ADMIN;
  
  return toc.filter(item => {
    return allowedSections.some(section => 
      item.title.toLowerCase().includes(section.toLowerCase()) ||
      section.toLowerCase().includes(item.title.toLowerCase())
    );
  });
}

/**
 * Filters sections based on user role
 */
export function filterSectionsByRole(sections: Section[], role: string): Section[] {
  const allowedSections = ROLE_SECTION_MAP[role] || ROLE_SECTION_MAP.ADMIN;
  
  // Build a set of allowed section IDs (level 2 headings that match)
  const allowedIds = new Set<string>();
  let currentParentAllowed = false;
  let currentParentTitle = '';
  
  for (const section of sections) {
    if (section.level === 2) {
      currentParentAllowed = allowedSections.some(allowed => 
        section.title.toLowerCase().includes(allowed.toLowerCase()) ||
        allowed.toLowerCase().includes(section.title.toLowerCase())
      );
      currentParentTitle = section.title;
      
      if (currentParentAllowed) {
        allowedIds.add(section.id);
      }
    } else if (currentParentAllowed) {
      // Include child sections if parent is allowed
      allowedIds.add(section.id);
    }
  }
  
  return sections.filter(section => allowedIds.has(section.id));
}

/**
 * Gets the content for a specific section and its children
 */
export function getSectionContent(sections: Section[], sectionId: string): string {
  const sectionIndex = sections.findIndex(s => s.id === sectionId);
  if (sectionIndex === -1) return '';
  
  const section = sections[sectionIndex];
  const contentParts: string[] = [section.content];
  
  // Include child sections (higher level numbers = deeper nesting)
  for (let i = sectionIndex + 1; i < sections.length; i++) {
    const nextSection = sections[i];
    if (nextSection.level <= section.level) {
      break; // Found another section at same or higher level
    }
    contentParts.push(nextSection.content);
  }
  
  return contentParts.join('\n');
}

/**
 * Gets filtered content based on role, returning both TOC and content
 */
export async function getFilteredManual(role: string): Promise<{
  toc: TOCItem[];
  sections: Section[];
  content: string;
}> {
  const manual = await getManual();
  const filteredToc = filterTOCByRole(manual.toc, role);
  const filteredSections = filterSectionsByRole(manual.sections, role);
  
  // Build filtered content
  const filteredContent = filteredSections.map(s => s.content).join('\n');
  
  return {
    toc: filteredToc,
    sections: filteredSections,
    content: filteredContent
  };
}

/**
 * Gets a list of available section filters (top-level sections)
 */
export function getAvailableSectionFilters(toc: TOCItem[]): { id: string; title: string }[] {
  return toc.map(item => ({
    id: item.id,
    title: item.title
  }));
}

/**
 * Searches sections for matching content
 */
export function searchSections(sections: Section[], query: string): Section[] {
  if (!query || query.length < 2) return sections;
  
  const lowerQuery = query.toLowerCase();
  
  return sections.filter(section => 
    section.title.toLowerCase().includes(lowerQuery) ||
    section.content.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Clears the cache (useful for development)
 */
export function clearCache(): void {
  cachedManual = null;
  cacheTimestamp = null;
}


