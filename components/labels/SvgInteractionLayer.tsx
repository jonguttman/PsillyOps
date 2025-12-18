'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import Moveable from 'react-moveable';
import type { PlaceableElement, Placement } from '@/lib/types/placement';
import { snapToAllowedRotation } from '@/lib/types/placement';

/**
 * SVG INTERACTION LAYER
 * 
 * Phase 2+3: SVG-native interaction with Moveable.
 * 
 * COORDINATE SYSTEM: SVG viewBox units ONLY during interaction.
 * Conversion to inches happens ONLY on commit (dragEnd/resizeEnd/rotateEnd).
 * 
 * Phase 3 additions:
 * - BARCODE element support with width-only resize
 * - Free rotation with soft snapping
 * - Bar height control via callback
 */

interface SvgInteractionLayerProps {
  /** The element to edit (QR or BARCODE) */
  element: PlaceableElement | null;
  
  /** SVG viewBox dimensions (extracted from label SVG) */
  viewBoxWidth: number;
  viewBoxHeight: number;
  
  /** Label physical dimensions (for inch conversion on save) */
  labelWidthIn: number;
  labelHeightIn: number;
  
  /** Called when element changes (values in INCHES for persistence) */
  onElementChange: (id: string, placement: Partial<Placement>) => void;
  
  /** Whether editing is disabled */
  disabled?: boolean;
  
  /** Zoom scale (1.0 = 100%) - MUST match CSS transform scale */
  zoom?: number;
  
  /** Reference to the stage container (for Moveable rootContainer) */
  stageRef?: React.RefObject<HTMLDivElement | null>;
}

export default function SvgInteractionLayer({
  element,
  viewBoxWidth,
  viewBoxHeight,
  labelWidthIn,
  labelHeightIn,
  onElementChange,
  disabled = false,
  zoom = 1,
  stageRef
}: SvgInteractionLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const qrGroupRef = useRef<SVGGElement>(null);
  const moveableRef = useRef<Moveable>(null);
  
  // Temporary transform state during interaction (viewBox units)
  const [tempTranslate, setTempTranslate] = useState<[number, number] | null>(null);
  const [tempRotation, setTempRotation] = useState<number | null>(null);
  const [tempSize, setTempSize] = useState<{ width: number; height: number } | null>(null);
  
  // Conversion factors: viewBox units per inch
  const vbPerInchX = viewBoxWidth / labelWidthIn;
  const vbPerInchY = viewBoxHeight / labelHeightIn;
  
  // Convert element placement from inches to viewBox units
  const getViewBoxPosition = useCallback(() => {
    if (!element) return { x: 0, y: 0, width: 0, height: 0, rotation: 0 };
    
    return {
      x: element.placement.xIn * vbPerInchX,
      y: element.placement.yIn * vbPerInchY,
      width: element.placement.widthIn * vbPerInchX,
      height: element.placement.heightIn * vbPerInchY,
      rotation: element.placement.rotation
    };
  }, [element, vbPerInchX, vbPerInchY]);
  
  // Current position in viewBox units
  const vbPos = getViewBoxPosition();
  const currentX = tempTranslate ? tempTranslate[0] : vbPos.x;
  const currentY = tempTranslate ? tempTranslate[1] : vbPos.y;
  const currentWidth = tempSize ? tempSize.width : vbPos.width;
  const currentHeight = tempSize ? tempSize.height : vbPos.height;
  const currentRotation = tempRotation !== null ? tempRotation : vbPos.rotation;

  
  // Commit temp values to parent (convert back to inches)
  const commitToState = useCallback(() => {
    if (!element) return;
    
    const updates: Partial<Placement> = {};
    
    if (tempTranslate) {
      updates.xIn = tempTranslate[0] / vbPerInchX;
      updates.yIn = tempTranslate[1] / vbPerInchY;
    }
    
    if (tempSize) {
      updates.widthIn = tempSize.width / vbPerInchX;
      updates.heightIn = tempSize.height / vbPerInchY;
    }
    
    if (tempRotation !== null) {
      // Snap to nearest allowed rotation using shared utility
      updates.rotation = snapToAllowedRotation(tempRotation);
    }
    
    // Reset temp state
    setTempTranslate(null);
    setTempRotation(null);
    setTempSize(null);
    
    // Notify parent
    if (Object.keys(updates).length > 0) {
      onElementChange(element.id, updates);
    }
  }, [element, tempTranslate, tempRotation, tempSize, vbPerInchX, vbPerInchY, onElementChange]);
  
  // Update Moveable rect when element changes externally
  useEffect(() => {
    if (moveableRef.current) {
      moveableRef.current.updateRect();
    }
  }, [element, zoom]);
  
  // Force re-render when ref is set
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (qrGroupRef.current) {
      setMounted(true);
    }
  }, []);
  
  if (!element) {
    return null;
  }
  
  // Element type determines resize behavior
  const isBarcode = element.type === 'BARCODE';
  const isQR = element.type === 'QR';
  
  // Build transform string
  // For rotation around center: translate to position, then translate to center, rotate, translate back
  const hw = currentWidth / 2;
  const hh = currentHeight / 2;
  const transformStr = currentRotation !== 0
    ? `translate(${currentX + hw}, ${currentY + hh}) rotate(${currentRotation}) translate(${-hw}, ${-hh})`
    : `translate(${currentX}, ${currentY})`;

  
  return (
    <>
      {/* SVG overlay - same viewBox as the label */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 10, pointerEvents: 'none' }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* QR Element group - interactive */}
        <g
          ref={qrGroupRef}
          transform={transformStr}
          style={{ 
            cursor: disabled ? 'not-allowed' : 'move',
            pointerEvents: disabled ? 'none' : 'all'
          }}
        >
          {/* Selection rectangle - minimal visual, Moveable provides handles */}
          <rect
            x={0}
            y={0}
            width={currentWidth}
            height={currentHeight}
            fill="transparent"
            stroke="transparent"
            strokeWidth={0}
          />
        </g>
      </svg>
      
      {/* Moveable attached to SVG group */}
      {!disabled && mounted && qrGroupRef.current && (
        <Moveable
          ref={moveableRef}
          target={qrGroupRef.current}
          
          // Container settings - critical for zoom alignment
          rootContainer={stageRef?.current || undefined}
          // With layout-based zoom (actual width/height, not CSS transform),
          // Moveable works naturally. No zoom compensation needed.
          // The handles scale with the content which is correct behavior.
          
          // Draggable
          draggable={true}
          onDragStart={({ set }) => {
            // Initialize drag from current position
            set([currentX, currentY]);
          }}
          onDrag={({ beforeTranslate }) => {
            setTempTranslate([beforeTranslate[0], beforeTranslate[1]]);
          }}
          onDragEnd={() => {
            commitToState();
          }}
          
          // Resizable - different behavior for QR vs BARCODE
          // QR: corner handles, keep ratio (square)
          // BARCODE: edge handles only (e/w for width), no vertical resize by handles
          resizable={true}
          keepRatio={isQR} // QR stays square, BARCODE can stretch width
          renderDirections={isBarcode ? ['e', 'w'] : ['nw', 'ne', 'sw', 'se']}
          onResizeStart={({ setOrigin, dragStart }) => {
            setOrigin(['%', '%']);
            if (dragStart) {
              dragStart.set([currentX, currentY]);
            }
          }}
          onResize={({ width, height, drag }) => {
            if (isBarcode) {
              // BARCODE: Width-only resize
              // Height is controlled separately via bar height control
              // Calculate new height based on width change (proportional text/gap)
              const widthIn = width / vbPerInchX;
              const textSizeIn = widthIn * 0.08;
              const textGapIn = widthIn * 0.03;
              const barHeightIn = element.barcode?.barHeightIn ?? 0.5;
              const newHeightIn = barHeightIn + textGapIn + textSizeIn;
              const newHeightVb = newHeightIn * vbPerInchY;
              
              setTempSize({ width, height: newHeightVb });
            } else {
              // QR: Proportional resize (keepRatio handles this)
              setTempSize({ width, height });
            }
            
            if (drag) {
              setTempTranslate([drag.beforeTranslate[0], drag.beforeTranslate[1]]);
            }
          }}
          onResizeEnd={() => {
            commitToState();
          }}
          
          // Rotatable - FREE rotation with soft snapping
          rotatable={true}
          rotationPosition="top"
          // Soft snap at 0°, 90°, 180°, -90° with 5° threshold
          // This provides magnetic snapping without forcing rotation steps
          snapRotationDegrees={[0, 90, 180, -90]}
          snapRotationThreshold={5}
          onRotate={({ beforeRotate }) => {
            // Free rotation during drag - store exact angle
            setTempRotation(beforeRotate + vbPos.rotation);
          }}
          onRotateEnd={() => {
            // On release, commit snaps to nearest allowed value
            commitToState();
          }}
          
          // Styling
          origin={false}
          
          // Enable snapping
          snappable={true}
        />
      )}
    </>
  );
}
