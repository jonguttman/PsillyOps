'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Components } from 'react-markdown';
import MermaidDiagram from './MermaidDiagram';

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Custom components for rendering
  const components: Components = {
    // Headings with anchor IDs
    h1: ({ children, ...props }) => {
      const id = generateId(String(children));
      return (
        <h1 id={id} className="scroll-mt-24 group" {...props}>
          {children}
          <a 
            href={`#${id}`} 
            className="ml-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600"
            aria-label="Link to this section"
          >
            #
          </a>
        </h1>
      );
    },
    h2: ({ children, ...props }) => {
      const id = generateId(String(children));
      return (
        <h2 id={id} className="scroll-mt-24 group border-b border-gray-200 pb-2 mt-8 mb-4" {...props}>
          {children}
          <a 
            href={`#${id}`} 
            className="ml-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 text-lg"
            aria-label="Link to this section"
          >
            #
          </a>
        </h2>
      );
    },
    h3: ({ children, ...props }) => {
      const id = generateId(String(children));
      return (
        <h3 id={id} className="scroll-mt-24 group mt-6 mb-3" {...props}>
          {children}
          <a 
            href={`#${id}`} 
            className="ml-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 text-base"
            aria-label="Link to this section"
          >
            #
          </a>
        </h3>
      );
    },
    h4: ({ children, ...props }) => {
      const id = generateId(String(children));
      return (
        <h4 id={id} className="scroll-mt-24 group mt-4 mb-2" {...props}>
          {children}
          <a 
            href={`#${id}`} 
            className="ml-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 text-sm"
            aria-label="Link to this section"
          >
            #
          </a>
        </h4>
      );
    },
    
    // Code blocks with syntax highlighting and mermaid support
    code: ({ className, children, ...props }) => {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      const codeContent = String(children).replace(/\n$/, '');
      
      // Handle mermaid diagrams
      if (language === 'mermaid') {
        return <MermaidDiagram chart={codeContent} />;
      }
      
      // Inline code
      if (!className) {
        return (
          <code 
            className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono" 
            {...props}
          >
            {children}
          </code>
        );
      }
      
      // Code block
      return (
        <div className="relative group">
          {language && (
            <span className="absolute top-2 right-2 text-xs text-gray-400 uppercase font-mono">
              {language}
            </span>
          )}
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto">
            <code className={`${className} text-sm font-mono`} {...props}>
              {children}
            </code>
          </pre>
        </div>
      );
    },
    
    // Pre element wrapper for code blocks
    pre: ({ children }) => {
      // Check if the child is a mermaid code block (already wrapped)
      const child = children as React.ReactElement<{ className?: string }>;
      if (child?.props?.className?.includes('language-mermaid')) {
        return <>{children}</>;
      }
      return <div>{children}</div>;
    },
    
    // Tables with enhanced styling
    table: ({ children, ...props }) => (
      <div className="overflow-x-auto my-4">
        <table 
          className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg" 
          {...props}
        >
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }) => (
      <thead className="bg-gray-50" {...props}>{children}</thead>
    ),
    th: ({ children, ...props }) => (
      <th 
        className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200" 
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td 
        className="px-4 py-3 text-sm text-gray-700 border-b border-gray-100" 
        {...props}
      >
        {children}
      </td>
    ),
    tr: ({ children, ...props }) => (
      <tr className="hover:bg-gray-50" {...props}>{children}</tr>
    ),
    
    // Links with external indicator
    a: ({ href, children, ...props }) => {
      const isExternal = href?.startsWith('http');
      const isAnchor = href?.startsWith('#');
      
      if (isAnchor) {
        return (
          <a 
            href={href} 
            className="text-blue-600 hover:text-blue-800 hover:underline"
            {...props}
          >
            {children}
          </a>
        );
      }
      
      if (isExternal) {
        return (
          <a 
            href={href} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
            {...props}
          >
            {children}
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        );
      }
      
      return (
        <a 
          href={href} 
          className="text-blue-600 hover:text-blue-800 hover:underline"
          {...props}
        >
          {children}
        </a>
      );
    },
    
    // Lists with proper styling
    ul: ({ children, ...props }) => (
      <ul className="list-disc list-inside space-y-1 my-2 ml-2" {...props}>{children}</ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="list-decimal list-inside space-y-1 my-2 ml-2" {...props}>{children}</ol>
    ),
    li: ({ children, ...props }) => (
      <li className="text-gray-700" {...props}>{children}</li>
    ),
    
    // Blockquotes
    blockquote: ({ children, ...props }) => (
      <blockquote 
        className="border-l-4 border-blue-500 bg-blue-50 pl-4 py-2 my-4 text-gray-700 italic" 
        {...props}
      >
        {children}
      </blockquote>
    ),
    
    // Horizontal rule
    hr: ({ ...props }) => (
      <hr className="my-8 border-gray-300" {...props} />
    ),
    
    // Paragraphs
    p: ({ children, ...props }) => (
      <p className="my-3 text-gray-700 leading-relaxed" {...props}>{children}</p>
    ),
    
    // Strong and emphasis
    strong: ({ children, ...props }) => (
      <strong className="font-semibold text-gray-900" {...props}>{children}</strong>
    ),
    em: ({ children, ...props }) => (
      <em className="italic" {...props}>{children}</em>
    ),
  };
  
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}

/**
 * Generate a URL-safe ID from heading text
 */
function generateId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}


