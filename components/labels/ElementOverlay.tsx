'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { PlaceableElement, Rotation } from '@/lib/types/placement';

// Minimum recommended QR size for reliable scanning
const TOO_SMALL_IN = 0.6;
const MIN_QR_SIZE_IN = 0.3;

interface ElementOverlayProps {
  // All placeable elements
  elements: PlaceableElement[];
  
  // Currently selected element ID (null if none)
  selectedId: string | null;
  
  // Label dimensions
  labelWidthIn: number;
  labelHeightIn: number;
  
  // Container dimensions (pixels)
  containerWidth: number;
  containerHeight: number;
  
  // Callbacks
  onElementChange: (id: string, updates: Partial<PlaceableElement['placement']>) => void;
  onSelect: (id: string | null) => void;
  
  // Display mode
  disabled?: boolean;
  
  // Zoom scale (1.0 = 100%, used to adjust drag coordinates)
  zoomScale?: number;
}

// Clamp helper
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function ElementOverlay({
  elements,
  selectedId,
  labelWidthIn,
  labelHeightIn,
  containerWidth,
  containerHeight,
  onElementChange,
  onSelect,
  disabled = false,
  zoomScale = 1
}: ElementOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragElementId, setDragElementId] = useState<string | null>(null);
  const [initialPlacement, setInitialPlacement] = useState<PlaceableElement['placement'] | null>(null);

  // Calculate pixels per inch based on container and label dimensions
  const pxPerInch = containerWidth / labelWidthIn;
  
  // Adjust for zoom when converting mouse deltas (screen coords are scaled by zoom)
  const effectivePxPerInch = pxPerInch * zoomScale;

  // Clamp placement to label bounds
  const clampPlacement = useCallback((
    placement: PlaceableElement['placement'],
    isQr: boolean
  ): PlaceableElement['placement'] => {
    const minSize = isQr ? MIN_QR_SIZE_IN : 0.2;
    let width = clamp(placement.widthIn, minSize, labelWidthIn);
    let height = clamp(placement.heightIn, minSize, labelHeightIn);
    
    // QR must be square
    if (isQr) {
      const size = Math.min(width, height);
      width = size;
      height = size;
    }
    
    return {
      xIn: clamp(placement.xIn, 0, labelWidthIn - width),
      yIn: clamp(placement.yIn, 0, labelHeightIn - height),
      widthIn: width,
      heightIn: height,
      rotation: placement.rotation
    };
  }, [labelWidthIn, labelHeightIn]);

  // Handle element drag start
  const handleMouseDown = useCallback((e: React.MouseEvent, element: PlaceableElement) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    
    onSelect(element.id);
    setIsDragging(true);
    setDragElementId(element.id);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialPlacement({ ...element.placement });
  }, [disabled, onSelect]);

  // Handle resize start
  const handleResizeMouseDown = useCallback((e: React.MouseEvent, element: PlaceableElement) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    
    onSelect(element.id);
    setIsResizing(true);
    setDragElementId(element.id);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialPlacement({ ...element.placement });
  }, [disabled, onSelect]);

  // Handle mouse move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!initialPlacement || !dragElementId) return;
      
      const element = elements.find(el => el.id === dragElementId);
      if (!element) return;
      
      const isQr = element.type === 'QR';
      
      if (isDragging) {
        const deltaX = e.clientX - dragStart.x;
        const deltaY = e.clientY - dragStart.y;
        
        // Convert pixel delta to inches (account for zoom scale)
        const deltaXIn = deltaX / effectivePxPerInch;
        const deltaYIn = deltaY / effectivePxPerInch;
        
        const newPlacement = clampPlacement({
          ...initialPlacement,
          xIn: initialPlacement.xIn + deltaXIn,
          yIn: initialPlacement.yIn + deltaYIn,
        }, isQr);
        
        onElementChange(dragElementId, newPlacement);
      } else if (isResizing) {
        const deltaX = e.clientX - dragStart.x;
        const deltaY = e.clientY - dragStart.y;
        
        // Use the larger delta for QR (maintain square), both for barcode
        if (isQr) {
          const delta = Math.max(deltaX, deltaY);
          const deltaIn = delta / effectivePxPerInch;
          const newSize = Math.max(MIN_QR_SIZE_IN, initialPlacement.widthIn + deltaIn);
          
          const newPlacement = clampPlacement({
            ...initialPlacement,
            widthIn: newSize,
            heightIn: newSize,
          }, isQr);
          
          onElementChange(dragElementId, newPlacement);
        } else {
          // Barcode: allow independent width/height
          const deltaXIn = deltaX / effectivePxPerInch;
          const deltaYIn = deltaY / effectivePxPerInch;
          
          const newPlacement = clampPlacement({
            ...initialPlacement,
            widthIn: Math.max(0.2, initialPlacement.widthIn + deltaXIn),
            heightIn: Math.max(0.2, initialPlacement.heightIn + deltaYIn),
          }, isQr);
          
          onElementChange(dragElementId, newPlacement);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setDragElementId(null);
      setInitialPlacement(null);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, dragStart, initialPlacement, dragElementId, effectivePxPerInch, clampPlacement, onElementChange, elements]);

  // Click on background to deselect
  const handleBackgroundClick = useCallback(() => {
    if (!isDragging && !isResizing) {
      onSelect(null);
    }
  }, [isDragging, isResizing, onSelect]);

  // Don't render if we don't have valid dimensions
  if (containerWidth <= 0 || containerHeight <= 0 || labelWidthIn <= 0) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: containerWidth, height: containerHeight }}
      onClick={handleBackgroundClick}
    >
      {elements.map((element) => {
        const isSelected = element.id === selectedId;
        const isBeingDragged = element.id === dragElementId && isDragging;
        const isTooSmall = element.type === 'QR' && element.placement.widthIn < TOO_SMALL_IN;
        
        // Convert placement from inches to pixels
        const leftPx = element.placement.xIn * pxPerInch;
        const topPx = element.placement.yIn * pxPerInch;
        const widthPx = element.placement.widthIn * pxPerInch;
        const heightPx = element.placement.heightIn * pxPerInch;
        
        // Rotation indicator style
        const rotationDeg = element.placement.rotation || 0;
        
        // Colors based on element type
        const borderColor = element.type === 'QR' 
          ? (isTooSmall ? '#ef4444' : '#3b82f6')
          : '#8b5cf6'; // Purple for barcode
        
        const bgColor = element.type === 'QR'
          ? (isTooSmall ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)')
          : 'rgba(139, 92, 246, 0.1)';
        
        return (
          <div
            key={element.id}
            className={`absolute pointer-events-auto cursor-move transition-shadow ${
              isBeingDragged ? 'shadow-lg z-20' : isSelected ? 'shadow-md z-10' : 'shadow-sm z-0'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            style={{
              left: leftPx,
              top: topPx,
              width: widthPx,
              height: heightPx,
              border: `2px ${isSelected ? 'solid' : 'dashed'} ${borderColor}`,
              backgroundColor: bgColor,
              borderRadius: 4,
            }}
            onMouseDown={(e) => handleMouseDown(e, element)}
            title={disabled ? 'Drag/resize disabled' : `Drag to move ${element.type}`}
          >
            {/* Type badge */}
            <div 
              className={`absolute -top-6 left-0 text-xs font-semibold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap ${
                element.type === 'QR' 
                  ? (isTooSmall ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700')
                  : 'bg-purple-100 text-purple-700'
              }`}
            >
              {element.type}
              {rotationDeg !== 0 && (
                <span className="ml-1 opacity-70">↻{rotationDeg}°</span>
              )}
              {isTooSmall && (
                <span className="ml-1" title="QR may be unreliable at this size">⚠️</span>
              )}
            </div>
            
            {/* Move icon */}
            <div className={`absolute inset-0 flex items-center justify-center ${
              element.type === 'QR' 
                ? (isTooSmall ? 'text-red-400/50' : 'text-blue-500/50')
                : 'text-purple-500/50'
            }`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </div>

            {/* Resize handle (bottom-right corner) */}
            {!disabled && isSelected && (
              <div
                className={`absolute bottom-0 right-0 w-4 h-4 cursor-se-resize rounded-tl ${
                  element.type === 'QR' 
                    ? (isTooSmall ? 'bg-red-500' : 'bg-blue-500')
                    : 'bg-purple-500'
                }`}
                onMouseDown={(e) => handleResizeMouseDown(e, element)}
                title={`Drag to resize ${element.type}`}
              >
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
                </svg>
              </div>
            )}

            {/* Rotation indicator (visual only) */}
            {rotationDeg !== 0 && (
              <div 
                className="absolute -right-1 -top-1 w-5 h-5 rounded-full bg-gray-800 text-white text-xs flex items-center justify-center"
                title={`Rotated ${rotationDeg}°`}
              >
                ↻
              </div>
            )}

            {/* Warning tooltip for small QR */}
            {isTooSmall && isSelected && (
              <div className="absolute -bottom-8 left-0 right-0 text-center">
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                  QR may be unreliable
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* Position/size indicator for selected element */}
      {selectedId && (() => {
        const selected = elements.find(el => el.id === selectedId);
        if (!selected) return null;
        
        return (
          <div className="absolute bottom-2 right-2 text-xs font-mono bg-black/70 text-white px-2 py-1 rounded">
            {selected.placement.xIn.toFixed(2)}, {selected.placement.yIn.toFixed(2)} · {selected.placement.widthIn.toFixed(2)}
            {selected.type !== 'QR' && `×${selected.placement.heightIn.toFixed(2)}`}in
            {selected.placement.rotation !== 0 && ` · ${selected.placement.rotation}°`}
          </div>
        );
      })()}
    </div>
  );
}

