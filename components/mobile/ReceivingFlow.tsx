'use client';

/**
 * ReceivingFlow Component
 * 
 * Mobile-optimized flow for receiving inventory.
 * Supports both PO-linked receiving and direct receiving.
 * 
 * Flow:
 * 1. Show material info
 * 2. If PO lines exist, show them for selection
 * 3. Prompt for quantity
 * 4. Confirm and submit
 * 5. Show success confirmation
 */

import React, { useCallback, useState } from 'react';
import { Package, Check, AlertCircle, ChevronRight, Minus, Plus } from 'lucide-react';
import { GlassCard, CeramicCard, PillButton } from '@/components/mobile';
import type { POLineMatch } from '@/lib/services/scanResolverService';

// Analytics hook placeholder
function trackEvent(event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log('[Analytics]', event, data);
  }
}

type ReceivingStep = 'select-po' | 'quantity' | 'confirm' | 'success' | 'error';

interface MaterialInfo {
  id: string;
  name: string;
  sku: string;
  currentStock: number;
  unitOfMeasure: string;
}

interface ReceivingFlowProps {
  material: MaterialInfo;
  openPOLines?: POLineMatch[];
  onComplete: (result: ReceivingResult) => void;
  onCancel: () => void;
}

interface ReceivingResult {
  success: boolean;
  materialId: string;
  quantityReceived: number;
  poLineId?: string;
  poNumber?: string;
  newStockLevel: number;
}

export function ReceivingFlow({
  material,
  openPOLines = [],
  onComplete,
  onCancel,
}: ReceivingFlowProps) {
  const [step, setStep] = useState<ReceivingStep>(openPOLines.length > 0 ? 'select-po' : 'quantity');
  const [selectedPO, setSelectedPO] = useState<POLineMatch | null>(null);
  const [quantity, setQuantity] = useState(selectedPO?.quantityRemaining || 1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReceivingResult | null>(null);

  // Handle PO selection
  const handleSelectPO = useCallback((po: POLineMatch | null) => {
    setSelectedPO(po);
    setQuantity(po?.quantityRemaining || 1);
    setStep('quantity');
    trackEvent('receiving_po_selected', { 
      hasPO: !!po, 
      poNumber: po?.poNumber 
    });
  }, []);

  // Quantity adjustment
  const adjustQuantity = useCallback((delta: number) => {
    setQuantity(prev => {
      const next = prev + delta;
      if (next < 1) return 1;
      if (selectedPO && next > selectedPO.quantityRemaining) {
        return selectedPO.quantityRemaining;
      }
      return next;
    });
  }, [selectedPO]);

  // Move to confirmation
  const handleConfirm = useCallback(() => {
    setStep('confirm');
    trackEvent('receiving_confirm_shown', { 
      quantity, 
      hasPO: !!selectedPO 
    });
  }, [quantity, selectedPO]);

  // Submit receiving
  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      const body = {
        materialId: material.id,
        quantity,
        poLineId: selectedPO?.lineItemId,
      };
      
      const res = await fetch('/api/inventory/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || 'Failed to receive inventory');
      }
      
      const receivingResult: ReceivingResult = {
        success: true,
        materialId: material.id,
        quantityReceived: quantity,
        poLineId: selectedPO?.lineItemId,
        poNumber: selectedPO?.poNumber,
        newStockLevel: data.newStockLevel || (material.currentStock + quantity),
      };
      
      setResult(receivingResult);
      setStep('success');
      trackEvent('receiving_success', { 
        quantity, 
        hasPO: !!selectedPO,
        materialId: material.id 
      });
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to receive inventory';
      setError(message);
      setStep('error');
      trackEvent('receiving_error', { error: message });
    } finally {
      setIsSubmitting(false);
    }
  }, [material, quantity, selectedPO]);

  // Render PO selection step
  if (step === 'select-po') {
    return (
      <div className="space-y-4">
        {/* Material header */}
        <CeramicCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{material.name}</p>
              <p className="text-xs text-gray-500">{material.sku}</p>
            </div>
          </div>
        </CeramicCard>

        {/* PO options */}
        <GlassCard>
          <p className="text-xs font-medium text-gray-500 mb-3">Select Purchase Order</p>
          
          <div className="space-y-2">
            {openPOLines.map((po) => (
              <button
                key={po.lineItemId}
                onClick={() => handleSelectPO(po)}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
              >
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">{po.poNumber}</p>
                  <p className="text-xs text-gray-500">{po.vendorName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{po.quantityRemaining}</p>
                    <p className="text-xs text-gray-500">remaining</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </button>
            ))}
            
            {/* Direct receive option */}
            <button
              onClick={() => handleSelectPO(null)}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-dashed border-gray-300 hover:border-amber-400 hover:bg-amber-50/50 transition-colors"
            >
              <div className="text-left">
                <p className="text-sm font-medium text-gray-700">Receive without PO</p>
                <p className="text-xs text-gray-500">Direct inventory adjustment</p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </GlassCard>

        <PillButton variant="glass" onClick={onCancel} className="w-full">
          Cancel
        </PillButton>
      </div>
    );
  }

  // Render quantity step
  if (step === 'quantity') {
    return (
      <div className="space-y-4">
        {/* Material + PO header */}
        <CeramicCard>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{material.name}</p>
              <p className="text-xs text-gray-500">
                {selectedPO ? `PO: ${selectedPO.poNumber}` : 'Direct receive (no PO)'}
              </p>
            </div>
          </div>
        </CeramicCard>

        {/* Quantity selector */}
        <GlassCard>
          <p className="text-xs font-medium text-gray-500 mb-4 text-center">
            Quantity to Receive
          </p>
          
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => adjustQuantity(-1)}
              disabled={quantity <= 1}
              className="w-12 h-12 rounded-full surface-glass flex items-center justify-center disabled:opacity-50"
            >
              <Minus className="w-5 h-5 text-gray-600" />
            </button>
            
            <div className="w-24 text-center">
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full text-center text-3xl font-semibold text-gray-900 bg-transparent border-none focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">{material.unitOfMeasure}</p>
            </div>
            
            <button
              onClick={() => adjustQuantity(1)}
              disabled={selectedPO ? quantity >= selectedPO.quantityRemaining : false}
              className="w-12 h-12 rounded-full surface-glass flex items-center justify-center disabled:opacity-50"
            >
              <Plus className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          
          {selectedPO && (
            <p className="text-xs text-gray-500 text-center mt-4">
              {selectedPO.quantityRemaining} remaining on PO
            </p>
          )}
        </GlassCard>

        {/* Actions */}
        <div className="space-y-2">
          <PillButton variant="ceramic" onClick={handleConfirm} className="w-full">
            Continue
          </PillButton>
          <PillButton 
            variant="glass" 
            onClick={() => openPOLines.length > 0 ? setStep('select-po') : onCancel()} 
            className="w-full"
          >
            Back
          </PillButton>
        </div>
      </div>
    );
  }

  // Render confirmation step
  if (step === 'confirm') {
    return (
      <div className="space-y-4">
        <GlassCard>
          <p className="text-xs font-medium text-gray-500 mb-4 text-center">Confirm Receiving</p>
          
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Material</span>
              <span className="text-sm font-medium text-gray-900">{material.name}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-500">Quantity</span>
              <span className="text-sm font-medium text-gray-900">
                {quantity} {material.unitOfMeasure}
              </span>
            </div>
            {selectedPO && (
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500">Purchase Order</span>
                <span className="text-sm font-medium text-gray-900">{selectedPO.poNumber}</span>
              </div>
            )}
            <div className="flex justify-between py-2">
              <span className="text-sm text-gray-500">New Stock Level</span>
              <span className="text-sm font-medium text-green-600">
                {material.currentStock + quantity} {material.unitOfMeasure}
              </span>
            </div>
          </div>
        </GlassCard>

        {!selectedPO && (
          <CeramicCard variant="warning">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-700">
                This receive is not linked to a purchase order. The quantity will be added directly to inventory.
              </p>
            </div>
          </CeramicCard>
        )}

        <div className="space-y-2">
          <PillButton 
            variant="ceramic" 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? 'Receiving...' : 'Confirm Receive'}
          </PillButton>
          <PillButton 
            variant="glass" 
            onClick={() => setStep('quantity')} 
            disabled={isSubmitting}
            className="w-full"
          >
            Back
          </PillButton>
        </div>
      </div>
    );
  }

  // Render success step
  if (step === 'success' && result) {
    return (
      <div className="space-y-4">
        <CeramicCard>
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <p className="text-lg font-semibold text-gray-900">Received!</p>
            <p className="text-sm text-gray-500 mt-1">
              {result.quantityReceived} {material.unitOfMeasure} of {material.name}
            </p>
            {result.poNumber && (
              <p className="text-xs text-gray-400 mt-2">
                Applied to {result.poNumber}
              </p>
            )}
          </div>
        </CeramicCard>

        <GlassCard>
          <div className="flex justify-between py-2">
            <span className="text-sm text-gray-500">New Stock Level</span>
            <span className="text-sm font-semibold text-green-600">
              {result.newStockLevel} {material.unitOfMeasure}
            </span>
          </div>
        </GlassCard>

        <div className="space-y-2">
          <PillButton variant="ceramic" onClick={() => onComplete(result)} className="w-full">
            Done
          </PillButton>
          <PillButton 
            variant="glass" 
            onClick={() => {
              setStep(openPOLines.length > 0 ? 'select-po' : 'quantity');
              setQuantity(1);
              setResult(null);
            }} 
            className="w-full"
          >
            Receive More
          </PillButton>
        </div>
      </div>
    );
  }

  // Render error step
  if (step === 'error') {
    return (
      <div className="space-y-4">
        <CeramicCard variant="warning">
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <p className="text-lg font-semibold text-gray-900">Receive Failed</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
          </div>
        </CeramicCard>

        <div className="space-y-2">
          <PillButton variant="ceramic" onClick={() => setStep('confirm')} className="w-full">
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

export default ReceivingFlow;

