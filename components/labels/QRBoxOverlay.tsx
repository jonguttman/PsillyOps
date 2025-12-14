'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

// Minimum recommended QR size for reliable scanning
const TOO_SMALL_IN = 0.6;
const MIN_QR_SIZE_IN = 0.3;

interface QrBoxPosition {
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
}

interface SuggestedRegion {
  region: QrBoxPosition;
  regionName: string;
}

interface QRBoxOverlayProps {
  // Current QR box position (absolute, in inches)
  qrBox: QrBoxPosition;
  
  // Label dimensions
  labelWidthIn: number;
  labelHeightIn: number;
  
  // Container dimensions (pixels)
  containerWidth: number;
  containerHeight: number;
  
  // Callbacks
  onBoxChange: (box: QrBoxPosition) => void;
  
  // Suggested regions for dead-space guidance
  suggestedRegions?: SuggestedRegion[];
  showSuggestions?: boolean;
  
  // Display mode
  disabled?: boolean;
  
  // Zoom scale (1.0 = 100%, used to adjust drag coordinates)
  zoomScale?: number;
}

// Clamp helper
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function QRBoxOverlay({
  qrBox,
  labelWidthIn,
  labelHeightIn,
  containerWidth,
  containerHeight,
  onBoxChange,
  suggestedRegions = [],
  showSuggestions = false,
  disabled = false,
  zoomScale = 1
}: QRBoxOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialBox, setInitialBox] = useState<QrBoxPosition | null>(null);

  // Calculate pixels per inch based on container and label dimensions
  const pxPerInch = containerWidth / labelWidthIn;
  
  // Adjust for zoom when converting mouse deltas (screen coords are scaled by zoom)
  const effectivePxPerInch = pxPerInch * zoomScale;
  
  // Convert QR box from inches to pixels
  const qrLeftPx = qrBox.xIn * pxPerInch;
  const qrTopPx = qrBox.yIn * pxPerInch;
  const qrSizePx = qrBox.widthIn * pxPerInch;

  // Check if QR is too small
  const isTooSmall = qrBox.widthIn < TOO_SMALL_IN;

  // Clamp QR box to label bounds
  const clampBox = useCallback((box: QrBoxPosition): QrBoxPosition => {
    const minSize = MIN_QR_SIZE_IN;
    const width = clamp(box.widthIn, minSize, labelWidthIn);
    const height = clamp(box.heightIn, minSize, labelHeightIn);
    
    return {
      xIn: clamp(box.xIn, 0, labelWidthIn - width),
      yIn: clamp(box.yIn, 0, labelHeightIn - height),
      widthIn: width,
      heightIn: height,
    };
  }, [labelWidthIn, labelHeightIn]);

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialBox({ ...qrBox });
  }, [disabled, qrBox]);

  // Handle resize start
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setInitialBox({ ...qrBox });
  }, [disabled, qrBox]);

  // Handle mouse move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!initialBox) return;
      
      if (isDragging) {
        const deltaX = e.clientX - dragStart.x;
        const deltaY = e.clientY - dragStart.y;
        
        // Convert pixel delta to inches (account for zoom scale)
        const deltaXIn = deltaX / effectivePxPerInch;
        const deltaYIn = deltaY / effectivePxPerInch;
        
        const newBox = clampBox({
          ...initialBox,
          xIn: initialBox.xIn + deltaXIn,
          yIn: initialBox.yIn + deltaYIn,
        });
        
        onBoxChange(newBox);
      } else if (isResizing) {
        const deltaX = e.clientX - dragStart.x;
        const deltaY = e.clientY - dragStart.y;
        
        // Use the larger delta to maintain square aspect ratio
        const delta = Math.max(deltaX, deltaY);
        const deltaIn = delta / effectivePxPerInch;
        
        const newSize = Math.max(MIN_QR_SIZE_IN, initialBox.widthIn + deltaIn);
        
        const newBox = clampBox({
          ...initialBox,
          widthIn: newSize,
          heightIn: newSize,
        });
        
        onBoxChange(newBox);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setInitialBox(null);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, dragStart, initialBox, effectivePxPerInch, clampBox, onBoxChange]);

  // Don't render if we don't have valid dimensions
  if (containerWidth <= 0 || containerHeight <= 0 || labelWidthIn <= 0) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: containerWidth, height: containerHeight }}
    >
      {/* Dead-space suggestion regions */}
      {showSuggestions && suggestedRegions.map((suggestion, idx) => {
        const { region, regionName } = suggestion;
        // Don't show suggestion if it overlaps significantly with current QR position
        const overlapX = Math.abs(region.xIn - qrBox.xIn) < 0.2;
        const overlapY = Math.abs(region.yIn - qrBox.yIn) < 0.2;
        if (overlapX && overlapY) return null;
        
        return (
          <div
            key={regionName}
            className="absolute pointer-events-auto cursor-pointer opacity-30 hover:opacity-60 transition-opacity"
            style={{
              left: region.xIn * pxPerInch,
              top: region.yIn * pxPerInch,
              width: region.widthIn * pxPerInch,
              height: region.heightIn * pxPerInch,
              backgroundColor: 'rgba(34, 197, 94, 0.3)',
              border: '2px dashed rgba(34, 197, 94, 0.6)',
              borderRadius: 4,
            }}
            onClick={() => {
              if (!disabled) {
                onBoxChange({
                  ...qrBox,
                  xIn: region.xIn,
                  yIn: region.yIn,
                });
              }
            }}
            title={`Move QR to ${regionName}`}
          >
            <div className="absolute -top-5 left-0 text-xs font-medium text-green-700 bg-green-100/80 px-1 rounded whitespace-nowrap">
              {regionName}
            </div>
          </div>
        );
      })}

      {/* QR Box */}
      <div
        className={`absolute pointer-events-auto cursor-move transition-shadow ${
          isDragging ? 'shadow-lg' : 'shadow-md'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={{
          left: qrLeftPx,
          top: qrTopPx,
          width: qrSizePx,
          height: qrSizePx,
          border: `2px dashed ${isTooSmall ? '#ef4444' : '#3b82f6'}`,
          backgroundColor: isTooSmall ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
          borderRadius: 4,
        }}
        onMouseDown={handleMouseDown}
        title={disabled ? 'Drag/resize disabled in sheet mode' : 'Drag to move QR code'}
      >
        {/* Size indicator */}
        <div className={`absolute -top-6 left-0 text-xs font-mono px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap ${
          isTooSmall ? 'bg-red-100 text-red-700' : 'bg-white/90 text-gray-700'
        }`}>
          {qrBox.widthIn.toFixed(2)}in
          {isTooSmall && (
            <span className="ml-1" title="QR may be unreliable at this size">⚠️</span>
          )}
        </div>
        
        {/* Move icon */}
        <div className={`absolute inset-0 flex items-center justify-center ${
          isTooSmall ? 'text-red-400/50' : 'text-blue-500/50'
        }`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </div>

        {/* Resize handle (bottom-right corner) */}
        {!disabled && (
          <div
            className={`absolute bottom-0 right-0 w-4 h-4 cursor-se-resize rounded-tl ${
              isTooSmall ? 'bg-red-500' : 'bg-blue-500'
            }`}
            onMouseDown={handleResizeMouseDown}
            title="Drag to resize QR code"
          >
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
            </svg>
          </div>
        )}

        {/* Warning tooltip for small QR */}
        {isTooSmall && (
          <div className="absolute -bottom-8 left-0 right-0 text-center">
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
              QR may be unreliable
            </span>
          </div>
        )}
      </div>

      {/* Position indicator */}
      <div className="absolute bottom-2 right-2 text-xs font-mono bg-black/70 text-white px-2 py-1 rounded">
        {qrBox.xIn.toFixed(2)}, {qrBox.yIn.toFixed(2)} · {qrBox.widthIn.toFixed(2)}in
      </div>
    </div>
  );
}
