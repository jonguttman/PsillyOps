'use client';

/**
 * MobileInventoryActions Component
 * 
 * Focused mobile inventory actions:
 * - Adjust quantity
 * - Move location
 * - Confirm counts
 * 
 * Does NOT include:
 * - Reorder logic
 * - Supplier management
 * - Cost edits
 */

import React, { useCallback, useState } from 'react';
import { 
  Package, 
  Minus, 
  Plus, 
  MapPin, 
  Check, 
  AlertTriangle,
  ClipboardCheck
} from 'lucide-react';
import { GlassCard, CeramicCard, PillButton } from '@/components/mobile';

// Analytics hook placeholder
function trackEvent(event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics]', event, data);
  }
}

type ActionType = 'adjust' | 'move' | 'confirm';
type ActionStep = 'select' | 'input' | 'confirm' | 'success' | 'error';

export interface InventoryItemData {
  id: string;
  quantityOnHand: number;
  quantityReserved: number;
  unitOfMeasure: string;
  location?: {
    id: string;
    name: string;
  };
  product?: {
    id: string;
    name: string;
    sku: string;
  };
  material?: {
    id: string;
    name: string;
    sku: string;
  };
  lotNumber?: string;
  expiryDate?: string;
}

export interface LocationOption {
  id: string;
  name: string;
}

interface MobileInventoryActionsProps {
  item: InventoryItemData;
  locations?: LocationOption[];
  initialAction?: ActionType;
  onComplete: (result: InventoryActionResult) => void;
  onCancel: () => void;
}

interface InventoryActionResult {
  success: boolean;
  action: ActionType;
  itemId: string;
  previousQuantity?: number;
  newQuantity?: number;
  previousLocation?: string;
  newLocation?: string;
}

export function MobileInventoryActions({
  item,
  locations = [],
  initialAction,
  onComplete,
  onCancel,
}: MobileInventoryActionsProps) {
  const [action, setAction] = useState<ActionType | null>(initialAction || null);
  const [step, setStep] = useState<ActionStep>(initialAction ? 'input' : 'select');
  const [adjustmentValue, setAdjustmentValue] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [confirmedQuantity, setConfirmedQuantity] = useState(item.quantityOnHand);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InventoryActionResult | null>(null);

  const itemName = item.product?.name || item.material?.name || 'Unknown Item';
  const itemSku = item.product?.sku || item.material?.sku;

  // Select action
  const handleSelectAction = useCallback((selectedAction: ActionType) => {
    setAction(selectedAction);
    setStep('input');
    trackEvent('inventory_action_selected', { action: selectedAction, itemId: item.id });
  }, [item.id]);

  // Submit adjustment
  const handleSubmitAdjustment = useCallback(async () => {
    if (adjustmentValue === 0) {
      setError('Adjustment value cannot be zero');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/inventory/${item.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deltaQty: adjustmentValue,
          reason: adjustmentReason || 'Mobile adjustment',
          adjustmentType: adjustmentValue > 0 ? 'ADD' : 'REMOVE',
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || 'Failed to adjust inventory');
      }
      
      const actionResult: InventoryActionResult = {
        success: true,
        action: 'adjust',
        itemId: item.id,
        previousQuantity: item.quantityOnHand,
        newQuantity: item.quantityOnHand + adjustmentValue,
      };
      
      setResult(actionResult);
      setStep('success');
      trackEvent('inventory_adjusted', { 
        itemId: item.id, 
        adjustment: adjustmentValue 
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to adjust inventory';
      setError(message);
      setStep('error');
    } finally {
      setIsSubmitting(false);
    }
  }, [item.id, item.quantityOnHand, adjustmentValue, adjustmentReason]);

  // Submit move
  const handleSubmitMove = useCallback(async () => {
    if (!selectedLocationId) {
      setError('Please select a location');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/inventory/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryId: item.id,
          toLocationId: selectedLocationId,
          quantity: item.quantityOnHand, // Move all quantity
          reason: 'Mobile location transfer',
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || 'Failed to move inventory');
      }
      
      const newLocation = locations.find(l => l.id === selectedLocationId);
      
      const actionResult: InventoryActionResult = {
        success: true,
        action: 'move',
        itemId: item.id,
        previousLocation: item.location?.name,
        newLocation: newLocation?.name,
      };
      
      setResult(actionResult);
      setStep('success');
      trackEvent('inventory_moved', { 
        itemId: item.id, 
        newLocationId: selectedLocationId 
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to move inventory';
      setError(message);
      setStep('error');
    } finally {
      setIsSubmitting(false);
    }
  }, [item.id, item.location, selectedLocationId, locations]);

  // Submit count confirmation
  const handleSubmitConfirm = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    
    const adjustment = confirmedQuantity - item.quantityOnHand;
    
    try {
      const res = await fetch(`/api/inventory/${item.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deltaQty: adjustment,
          reason: 'Count confirmation',
          adjustmentType: adjustment > 0 ? 'ADD' : 'REMOVE',
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || 'Failed to confirm count');
      }
      
      const actionResult: InventoryActionResult = {
        success: true,
        action: 'confirm',
        itemId: item.id,
        previousQuantity: item.quantityOnHand,
        newQuantity: confirmedQuantity,
      };
      
      setResult(actionResult);
      setStep('success');
      trackEvent('inventory_count_confirmed', { 
        itemId: item.id, 
        previousQty: item.quantityOnHand,
        confirmedQty: confirmedQuantity
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to confirm count';
      setError(message);
      setStep('error');
    } finally {
      setIsSubmitting(false);
    }
  }, [item.id, item.quantityOnHand, confirmedQuantity]);

  // Render action selection
  if (step === 'select') {
    return (
      <div className="space-y-4">
        {/* Item header */}
        <CeramicCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{itemName}</p>
              <p className="text-xs text-gray-500">{itemSku}</p>
              <p className="text-xs text-gray-500 mt-1">
                Qty: {item.quantityOnHand} {item.unitOfMeasure}
                {item.location && ` · ${item.location.name}`}
              </p>
            </div>
          </div>
        </CeramicCard>

        {/* Action options */}
        <GlassCard>
          <p className="text-xs font-medium text-gray-500 mb-3">Select Action</p>
          
          <div className="space-y-2">
            <button
              onClick={() => handleSelectAction('adjust')}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Plus className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">Adjust Quantity</p>
                <p className="text-xs text-gray-500">Add or remove inventory</p>
              </div>
            </button>
            
            <button
              onClick={() => handleSelectAction('move')}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">Move Location</p>
                <p className="text-xs text-gray-500">Transfer to another location</p>
              </div>
            </button>
            
            <button
              onClick={() => handleSelectAction('confirm')}
              className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">Confirm Count</p>
                <p className="text-xs text-gray-500">Verify physical inventory</p>
              </div>
            </button>
          </div>
        </GlassCard>

        <PillButton variant="glass" onClick={onCancel} className="w-full">
          Cancel
        </PillButton>
      </div>
    );
  }

  // Render adjustment input
  if (step === 'input' && action === 'adjust') {
    const newQuantity = item.quantityOnHand + adjustmentValue;
    const isNegative = newQuantity < 0;
    
    return (
      <div className="space-y-4">
        <CeramicCard>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{itemName}</p>
              <p className="text-xs text-gray-500">Current: {item.quantityOnHand} {item.unitOfMeasure}</p>
            </div>
          </div>
          
          {/* Adjustment controls */}
          <div className="flex items-center justify-center gap-4 py-4">
            <button
              onClick={() => setAdjustmentValue(v => v - 1)}
              className="w-14 h-14 rounded-full surface-glass flex items-center justify-center"
            >
              <Minus className="w-6 h-6 text-gray-600" />
            </button>
            
            <div className="w-28 text-center">
              <input
                type="number"
                value={adjustmentValue}
                onChange={(e) => setAdjustmentValue(parseInt(e.target.value) || 0)}
                className={`
                  w-full text-center text-3xl font-semibold bg-transparent border-none focus:outline-none
                  ${adjustmentValue > 0 ? 'text-green-600' : adjustmentValue < 0 ? 'text-red-600' : 'text-gray-900'}
                `}
              />
              <p className="text-xs text-gray-500 mt-1">
                {adjustmentValue > 0 ? '+' : ''}{adjustmentValue} {item.unitOfMeasure}
              </p>
            </div>
            
            <button
              onClick={() => setAdjustmentValue(v => v + 1)}
              className="w-14 h-14 rounded-full surface-glass flex items-center justify-center"
            >
              <Plus className="w-6 h-6 text-gray-600" />
            </button>
          </div>
          
          {/* New quantity preview */}
          <div className={`
            px-4 py-3 rounded-xl text-center
            ${isNegative ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}
          `}>
            <p className="text-sm">
              New quantity: <span className="font-semibold">{newQuantity} {item.unitOfMeasure}</span>
            </p>
          </div>
        </CeramicCard>

        {/* Reason input */}
        <GlassCard>
          <label className="block text-xs font-medium text-gray-500 mb-2">
            Reason (optional)
          </label>
          <input
            type="text"
            value={adjustmentReason}
            onChange={(e) => setAdjustmentReason(e.target.value)}
            placeholder="e.g., Damaged, Miscounted, Sample..."
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        </GlassCard>

        {isNegative && (
          <CeramicCard variant="warning">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700">
                This adjustment would result in negative inventory.
              </p>
            </div>
          </CeramicCard>
        )}

        <div className="space-y-2">
          <PillButton 
            variant="ceramic" 
            onClick={handleSubmitAdjustment}
            disabled={isSubmitting || adjustmentValue === 0 || isNegative}
            className="w-full"
          >
            {isSubmitting ? 'Saving...' : 'Confirm Adjustment'}
          </PillButton>
          <PillButton 
            variant="glass" 
            onClick={() => setStep('select')}
            disabled={isSubmitting}
            className="w-full"
          >
            Back
          </PillButton>
        </div>
      </div>
    );
  }

  // Render move location input
  if (step === 'input' && action === 'move') {
    return (
      <div className="space-y-4">
        <CeramicCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{itemName}</p>
              <p className="text-xs text-gray-500">
                Current: {item.location?.name || 'No location'}
              </p>
            </div>
          </div>
        </CeramicCard>

        <GlassCard>
          <p className="text-xs font-medium text-gray-500 mb-3">Select New Location</p>
          
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {locations.map((location) => (
              <button
                key={location.id}
                onClick={() => setSelectedLocationId(location.id)}
                disabled={location.id === item.location?.id}
                className={`
                  w-full flex items-center gap-3 p-3 rounded-xl transition-colors
                  ${selectedLocationId === location.id ? 'bg-blue-100 border-2 border-blue-500' : 'border border-gray-200 hover:border-blue-300'}
                  ${location.id === item.location?.id ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <MapPin className={`w-4 h-4 ${selectedLocationId === location.id ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className="text-sm text-gray-900">{location.name}</span>
                {location.id === item.location?.id && (
                  <span className="text-xs text-gray-500 ml-auto">(current)</span>
                )}
                {selectedLocationId === location.id && (
                  <Check className="w-4 h-4 text-blue-600 ml-auto" />
                )}
              </button>
            ))}
            
            {locations.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                No locations available
              </p>
            )}
          </div>
        </GlassCard>

        <div className="space-y-2">
          <PillButton 
            variant="ceramic" 
            onClick={handleSubmitMove}
            disabled={isSubmitting || !selectedLocationId}
            className="w-full"
          >
            {isSubmitting ? 'Moving...' : 'Confirm Move'}
          </PillButton>
          <PillButton 
            variant="glass" 
            onClick={() => setStep('select')}
            disabled={isSubmitting}
            className="w-full"
          >
            Back
          </PillButton>
        </div>
      </div>
    );
  }

  // Render count confirmation input
  if (step === 'input' && action === 'confirm') {
    const difference = confirmedQuantity - item.quantityOnHand;
    
    return (
      <div className="space-y-4">
        <CeramicCard>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <ClipboardCheck className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{itemName}</p>
              <p className="text-xs text-gray-500">System: {item.quantityOnHand} {item.unitOfMeasure}</p>
            </div>
          </div>
          
          <p className="text-xs font-medium text-gray-500 mb-4 text-center">
            Enter Physical Count
          </p>
          
          {/* Count input */}
          <div className="flex items-center justify-center gap-4 py-4">
            <button
              onClick={() => setConfirmedQuantity(v => Math.max(0, v - 1))}
              className="w-14 h-14 rounded-full surface-glass flex items-center justify-center"
            >
              <Minus className="w-6 h-6 text-gray-600" />
            </button>
            
            <div className="w-28 text-center">
              <input
                type="number"
                value={confirmedQuantity}
                onChange={(e) => setConfirmedQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full text-center text-3xl font-semibold text-gray-900 bg-transparent border-none focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">{item.unitOfMeasure}</p>
            </div>
            
            <button
              onClick={() => setConfirmedQuantity(v => v + 1)}
              className="w-14 h-14 rounded-full surface-glass flex items-center justify-center"
            >
              <Plus className="w-6 h-6 text-gray-600" />
            </button>
          </div>
          
          {/* Difference display */}
          {difference !== 0 && (
            <div className={`
              px-4 py-3 rounded-xl text-center
              ${difference > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}
            `}>
              <p className="text-sm">
                Variance: <span className="font-semibold">{difference > 0 ? '+' : ''}{difference} {item.unitOfMeasure}</span>
              </p>
            </div>
          )}
          
          {difference === 0 && (
            <div className="px-4 py-3 rounded-xl bg-gray-100 text-center">
              <p className="text-sm text-gray-700">Count matches system</p>
            </div>
          )}
        </CeramicCard>

        <div className="space-y-2">
          <PillButton 
            variant="ceramic" 
            onClick={handleSubmitConfirm}
            disabled={isSubmitting}
            icon={<Check className="w-4 h-4" />}
            className="w-full"
          >
            {isSubmitting ? 'Confirming...' : 'Confirm Count'}
          </PillButton>
          <PillButton 
            variant="glass" 
            onClick={() => setStep('select')}
            disabled={isSubmitting}
            className="w-full"
          >
            Back
          </PillButton>
        </div>
      </div>
    );
  }

  // Render success
  if (step === 'success' && result) {
    return (
      <div className="space-y-4">
        <CeramicCard>
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-lg font-semibold text-gray-900">
              {action === 'adjust' && 'Quantity Adjusted'}
              {action === 'move' && 'Location Updated'}
              {action === 'confirm' && 'Count Confirmed'}
            </p>
            <p className="text-sm text-gray-500 mt-1">{itemName}</p>
          </div>
        </CeramicCard>

        <GlassCard>
          {result.action === 'adjust' && (
            <div className="flex justify-between py-2">
              <span className="text-sm text-gray-500">New Quantity</span>
              <span className="text-sm font-semibold text-green-600">
                {result.newQuantity} {item.unitOfMeasure}
              </span>
            </div>
          )}
          {result.action === 'move' && (
            <div className="flex justify-between py-2">
              <span className="text-sm text-gray-500">New Location</span>
              <span className="text-sm font-semibold text-green-600">
                {result.newLocation}
              </span>
            </div>
          )}
          {result.action === 'confirm' && result.previousQuantity !== result.newQuantity && (
            <div className="flex justify-between py-2">
              <span className="text-sm text-gray-500">Adjusted</span>
              <span className="text-sm font-semibold text-gray-900">
                {result.previousQuantity} → {result.newQuantity} {item.unitOfMeasure}
              </span>
            </div>
          )}
        </GlassCard>

        <PillButton variant="ceramic" onClick={() => onComplete(result)} className="w-full">
          Done
        </PillButton>
      </div>
    );
  }

  // Render error
  if (step === 'error') {
    return (
      <div className="space-y-4">
        <CeramicCard variant="warning">
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <p className="text-lg font-semibold text-gray-900">Action Failed</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </CeramicCard>

        <div className="space-y-2">
          <PillButton variant="ceramic" onClick={() => setStep('input')} className="w-full">
            Try Again
          </PillButton>
          <PillButton variant="glass" onClick={onCancel} className="w-full">
            Cancel
          </PillButton>
        </div>
      </div>
    );
  }

  return null;
}

export default MobileInventoryActions;

