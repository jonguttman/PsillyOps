'use client';

import { useEffect, useRef, useState, useId } from 'react';

interface MermaidDiagramProps {
  chart: string;
}

export default function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const uniqueId = useId().replace(/:/g, '-');
  
  useEffect(() => {
    let mounted = true;
    
    const renderDiagram = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Dynamic import to avoid SSR issues
        const mermaid = (await import('mermaid')).default;
        
        // Initialize mermaid with theme settings
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          flowchart: {
            htmlLabels: true,
            curve: 'basis',
          },
          sequence: {
            diagramMarginX: 50,
            diagramMarginY: 10,
            actorMargin: 50,
            width: 150,
            height: 65,
            boxMargin: 10,
            useMaxWidth: true,
          },
        });
        
        // Generate unique ID for this diagram
        const diagramId = `mermaid-${uniqueId}`;
        
        // Render the diagram
        const { svg: renderedSvg } = await mermaid.render(diagramId, chart);
        
        if (mounted) {
          setSvg(renderedSvg);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram');
          setIsLoading(false);
        }
      }
    };
    
    renderDiagram();
    
    return () => {
      mounted = false;
    };
  }, [chart, uniqueId]);
  
  if (isLoading) {
    return (
      <div className="my-6 p-6 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
            <circle 
              className="opacity-25" 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="4"
            />
            <path 
              className="opacity-75" 
              fill="currentColor" 
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-sm">Loading diagram...</span>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="my-6 p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-medium text-red-800">Diagram Error</h4>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <details className="mt-2">
              <summary className="text-xs text-red-500 cursor-pointer hover:text-red-700">
                View source
              </summary>
              <pre className="mt-2 p-2 bg-red-100 rounded text-xs overflow-x-auto text-red-800">
                {chart}
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      ref={containerRef}
      className="my-6 p-4 bg-white border border-gray-200 rounded-lg overflow-x-auto"
    >
      <div 
        className="mermaid-diagram flex justify-center"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}


