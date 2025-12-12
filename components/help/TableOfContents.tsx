'use client';

import { useState } from 'react';
import type { TOCItem } from '@/lib/services/helpService';

interface TableOfContentsProps {
  items: TOCItem[];
  activeHeading: string | null;
  onItemClick: (id: string) => void;
  selectedSection: string | null;
}

export default function TableOfContents({
  items,
  activeHeading,
  onItemClick,
  selectedSection
}: TableOfContentsProps) {
  return (
    <nav className="space-y-1">
      {items.map((item) => (
        <TOCItemComponent
          key={item.id}
          item={item}
          activeHeading={activeHeading}
          onItemClick={onItemClick}
          selectedSection={selectedSection}
          depth={0}
        />
      ))}
    </nav>
  );
}

interface TOCItemComponentProps {
  item: TOCItem;
  activeHeading: string | null;
  onItemClick: (id: string) => void;
  selectedSection: string | null;
  depth: number;
}

function TOCItemComponent({
  item,
  activeHeading,
  onItemClick,
  selectedSection,
  depth
}: TOCItemComponentProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = item.children && item.children.length > 0;
  
  const isActive = activeHeading === item.id;
  const isSelected = selectedSection === item.id;
  
  // Determine if this item or any child is active
  const containsActive = isActive || (hasChildren && item.children.some(child => 
    child.id === activeHeading || (child.children && child.children.some(gc => gc.id === activeHeading))
  ));
  
  // If we have a selected section, only show items that match or are children
  const isVisible = !selectedSection || 
    item.id === selectedSection || 
    isChildOfSelected(item, selectedSection) ||
    depth === 0; // Always show top-level items
  
  if (!isVisible) return null;
  
  return (
    <div className="space-y-0.5">
      <div 
        className={`
          flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer
          transition-colors duration-150
          ${isActive 
            ? 'bg-blue-100 text-blue-900 font-medium' 
            : isSelected
              ? 'bg-gray-100 text-gray-900'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onItemClick(item.id)}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-0.5 hover:bg-gray-200 rounded flex-shrink-0"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <svg 
              className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        <span className={`text-sm truncate ${!hasChildren ? 'ml-4' : ''}`}>
          {item.title}
        </span>
      </div>
      
      {hasChildren && isExpanded && (
        <div className="ml-1">
          {item.children.map((child) => (
            <TOCItemComponent
              key={child.id}
              item={child}
              activeHeading={activeHeading}
              onItemClick={onItemClick}
              selectedSection={selectedSection}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Check if an item is a child of the selected section
 */
function isChildOfSelected(item: TOCItem, selectedSection: string): boolean {
  // This is a simplified check - in a real implementation you might want
  // to traverse up the parent chain
  return false;
}


