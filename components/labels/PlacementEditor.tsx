'use client';

import { useReducer, useCallback, useMemo, useEffect } from 'react';
import type { PlaceableElement, Placement, Rotation } from '@/lib/types/placement';
import ElementOverlay from './ElementOverlay';

// ========================================
// STATE & ACTIONS
// ========================================

interface PlacementState {
  elements: PlaceableElement[];
  selectedId: string | null;
  isDirty: boolean;
}

type PlacementAction =
  | { type: 'MOVE'; id: string; deltaXIn: number; deltaYIn: number }
  | { type: 'RESIZE'; id: string; widthIn: number; heightIn: number }
  | { type: 'ROTATE'; id: string; rotation: Rotation }
  | { type: 'UPDATE_PLACEMENT'; id: string; placement: Partial<Placement> }
  | { type: 'ADD'; element: PlaceableElement }
  | { type: 'REMOVE'; id: string }
  | { type: 'SELECT'; id: string | null }
  | { type: 'RESET'; elements: PlaceableElement[] }
  | { type: 'MARK_CLEAN' };

function placementReducer(state: PlacementState, action: PlacementAction): PlacementState {
  switch (action.type) {
    case 'MOVE': {
      const elements = state.elements.map(el => {
        if (el.id !== action.id) return el;
        return {
          ...el,
          placement: {
            ...el.placement,
            xIn: el.placement.xIn + action.deltaXIn,
            yIn: el.placement.yIn + action.deltaYIn,
          }
        };
      });
      return { ...state, elements, isDirty: true };
    }
    
    case 'RESIZE': {
      const elements = state.elements.map(el => {
        if (el.id !== action.id) return el;
        const isQr = el.type === 'QR';
        return {
          ...el,
          placement: {
            ...el.placement,
            widthIn: action.widthIn,
            heightIn: isQr ? action.widthIn : action.heightIn, // QR must be square
          }
        };
      });
      return { ...state, elements, isDirty: true };
    }
    
    case 'ROTATE': {
      const elements = state.elements.map(el => {
        if (el.id !== action.id) return el;
        return {
          ...el,
          placement: {
            ...el.placement,
            rotation: action.rotation,
          }
        };
      });
      return { ...state, elements, isDirty: true };
    }
    
    case 'UPDATE_PLACEMENT': {
      const elements = state.elements.map(el => {
        if (el.id !== action.id) return el;
        const isQr = el.type === 'QR';
        const newPlacement = { ...el.placement, ...action.placement };
        // Enforce QR square constraint
        if (isQr && action.placement.widthIn !== undefined) {
          newPlacement.heightIn = action.placement.widthIn;
        }
        return { ...el, placement: newPlacement };
      });
      return { ...state, elements, isDirty: true };
    }
    
    case 'ADD': {
      return {
        ...state,
        elements: [...state.elements, action.element],
        selectedId: action.element.id,
        isDirty: true
      };
    }
    
    case 'REMOVE': {
      const elements = state.elements.filter(el => el.id !== action.id);
      return {
        ...state,
        elements,
        selectedId: state.selectedId === action.id ? null : state.selectedId,
        isDirty: true
      };
    }
    
    case 'SELECT': {
      return { ...state, selectedId: action.id };
    }
    
    case 'RESET': {
      return {
        elements: action.elements,
        selectedId: null,
        isDirty: false
      };
    }
    
    case 'MARK_CLEAN': {
      return { ...state, isDirty: false };
    }
    
    default:
      return state;
  }
}

// ========================================
// COMPONENT PROPS
// ========================================

interface PlacementEditorProps {
  // Label info
  versionId: string;
  labelWidthIn: number;
  labelHeightIn: number;
  
  // Initial elements from server
  initialElements: PlaceableElement[];
  
  // SVG preview content
  previewSvg: string;
  
  // Container dimensions
  containerWidth: number;
  containerHeight: number;
  
  // Pixels per inch from SVG viewBox (server-provided)
  pxPerInchX: number;
  pxPerInchY: number;
  
  // Callbacks
  onElementsChange: (elements: PlaceableElement[]) => void;
  onSave: () => Promise<void>;
  
  // State
  isSaving?: boolean;
  zoomScale?: number;
  disabled?: boolean;
}

// ========================================
// COMPONENT
// ========================================

export default function PlacementEditor({
  versionId,
  labelWidthIn,
  labelHeightIn,
  initialElements,
  previewSvg,
  containerWidth,
  containerHeight,
  pxPerInchX,
  pxPerInchY,
  onElementsChange,
  onSave,
  isSaving = false,
  zoomScale = 1,
  disabled = false
}: PlacementEditorProps) {
  // Initialize state with initial elements
  const [state, dispatch] = useReducer(placementReducer, {
    elements: initialElements,
    selectedId: initialElements.length > 0 ? initialElements[0].id : null,
    isDirty: false
  });

  // Sync elements changes to parent
  useEffect(() => {
    onElementsChange(state.elements);
  }, [state.elements, onElementsChange]);

  // Reset when initialElements change (e.g., after save or version change)
  useEffect(() => {
    dispatch({ type: 'RESET', elements: initialElements });
  }, [versionId]); // Only reset on version change, not on every initialElements update

  // Handle element placement changes from overlay
  const handleElementChange = useCallback((id: string, updates: Partial<Placement>) => {
    dispatch({ type: 'UPDATE_PLACEMENT', id, placement: updates });
  }, []);

  // Handle element selection
  const handleSelect = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT', id });
  }, []);

  // Rotate selected element
  const handleRotate = useCallback((rotation: Rotation) => {
    if (state.selectedId) {
      dispatch({ type: 'ROTATE', id: state.selectedId, rotation });
    }
  }, [state.selectedId]);

  // Get selected element
  const selectedElement = useMemo(() => {
    return state.elements.find(el => el.id === state.selectedId) || null;
  }, [state.elements, state.selectedId]);

  // Handle save
  const handleSave = useCallback(async () => {
    await onSave();
    dispatch({ type: 'MARK_CLEAN' });
  }, [onSave]);

  // Handle reset
  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET', elements: initialElements });
  }, [initialElements]);

  return (
    <div className="flex flex-col gap-4">
      {/* Preview with overlay */}
      <div className="relative border rounded-lg overflow-hidden bg-gray-100">
        {/* SVG Preview */}
        <div
          className="relative"
          style={{
            width: containerWidth,
            height: containerHeight,
            transform: `scale(${zoomScale})`,
            transformOrigin: 'top left'
          }}
          dangerouslySetInnerHTML={{ __html: previewSvg }}
        />
        
        {/* Element Overlay */}
        <div 
          className="absolute inset-0"
          style={{
            transform: `scale(${zoomScale})`,
            transformOrigin: 'top left'
          }}
        >
          <ElementOverlay
            elements={state.elements}
            selectedId={state.selectedId}
            labelWidthIn={labelWidthIn}
            labelHeightIn={labelHeightIn}
            containerWidth={containerWidth}
            containerHeight={containerHeight}
            pxPerInchX={pxPerInchX}
            pxPerInchY={pxPerInchY}
            onElementChange={handleElementChange}
            onSelect={handleSelect}
            disabled={disabled}
            zoomScale={zoomScale}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-4 px-2">
        {/* Selected element info & rotation */}
        <div className="flex items-center gap-2">
          {selectedElement ? (
            <>
              <span className="text-sm text-gray-600">
                {selectedElement.type} selected
              </span>
              
              {/* Rotation buttons */}
              <div className="flex items-center gap-1 ml-4">
                <span className="text-xs text-gray-500 mr-1">Rotate:</span>
                {([0, 90, -90] as Rotation[]).map((rot) => (
                  <button
                    key={rot}
                    onClick={() => handleRotate(rot)}
                    disabled={disabled || isSaving}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      selectedElement.placement.rotation === rot
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    } ${(disabled || isSaving) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {rot === 0 ? '0°' : rot === 90 ? '+90°' : '-90°'}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <span className="text-sm text-gray-400">No element selected</span>
          )}
        </div>

        {/* Save/Reset buttons */}
        <div className="flex items-center gap-2">
          {state.isDirty && (
            <span className="text-xs text-amber-600 mr-2">Unsaved changes</span>
          )}
          
          <button
            onClick={handleReset}
            disabled={!state.isDirty || isSaving}
            className={`px-3 py-1.5 text-sm rounded border transition-colors ${
              state.isDirty && !isSaving
                ? 'border-gray-300 text-gray-700 hover:bg-gray-100'
                : 'border-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            Reset
          </button>
          
          <button
            onClick={handleSave}
            disabled={!state.isDirty || isSaving}
            className={`px-4 py-1.5 text-sm rounded transition-colors ${
              state.isDirty && !isSaving
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isSaving ? 'Saving...' : 'Save Position'}
          </button>
        </div>
      </div>

      {/* Element details panel */}
      {selectedElement && (
        <div className="p-3 bg-gray-50 rounded-lg border">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            {selectedElement.type} Element Details
          </h4>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-gray-500">X:</span>
              <span className="ml-1 font-mono">{selectedElement.placement.xIn.toFixed(3)}in</span>
            </div>
            <div>
              <span className="text-gray-500">Y:</span>
              <span className="ml-1 font-mono">{selectedElement.placement.yIn.toFixed(3)}in</span>
            </div>
            <div>
              <span className="text-gray-500">W:</span>
              <span className="ml-1 font-mono">{selectedElement.placement.widthIn.toFixed(3)}in</span>
            </div>
            <div>
              <span className="text-gray-500">H:</span>
              <span className="ml-1 font-mono">{selectedElement.placement.heightIn.toFixed(3)}in</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Rotation: {selectedElement.placement.rotation}° • 
            Label: {labelWidthIn.toFixed(2)}×{labelHeightIn.toFixed(2)}in
          </div>
        </div>
      )}
    </div>
  );
}

// ========================================
// EXPORTS
// ========================================

export { placementReducer };
export type { PlacementState, PlacementAction };

