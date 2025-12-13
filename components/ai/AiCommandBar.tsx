'use client';

import { useState, useEffect, useCallback } from 'react';

interface CommandArgs {
  materialRef?: string;
  quantity?: number;
  unit?: string;
  locationRef?: string;
  lotNumber?: string;
  expiryDate?: string;
  vendorRef?: string;
  itemRef?: string;
  toLocationRef?: string;
  delta?: number;
  reason?: string;
  retailerRef?: string;
  items?: { productRef: string; quantity: number }[];
  batchRef?: string;
  yieldQuantity?: number;
  lossQuantity?: number;
  lossReason?: string;
  name?: string;
  sku?: string;
}

interface ParsedCommand {
  command: string;
  args: CommandArgs;
  resolved?: Record<string, any>;
}

interface CommandResult {
  success: boolean;
  logId?: string;
  command?: ParsedCommand;
  summary?: string;
  executed?: boolean;
  executionResult?: {
    success: boolean;
    message: string;
    details?: any;
  };
  correctionApplied?: boolean;
  error?: string;
}

interface AiCommandBarProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMAND_TYPES = [
  { value: 'RECEIVE_MATERIAL', label: 'Receive Material' },
  { value: 'MOVE_INVENTORY', label: 'Move Inventory' },
  { value: 'ADJUST_INVENTORY', label: 'Adjust Inventory' },
  { value: 'CREATE_RETAILER_ORDER', label: 'Create Order' },
  { value: 'COMPLETE_BATCH', label: 'Complete Batch' },
  { value: 'CREATE_MATERIAL', label: 'Create Material' },
];

export default function AiCommandBar({ isOpen, onClose }: AiCommandBarProps) {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCommand, setEditedCommand] = useState<ParsedCommand | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setInputText('');
      setResult(null);
      setError(null);
      setIsEditing(false);
      setEditedCommand(null);
    }
  }, [isOpen]);

  // Handle keyboard shortcut to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const interpretCommand = useCallback(async () => {
    if (!inputText.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setIsEditing(false);
    setEditedCommand(null);

    try {
      const response = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, execute: false }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to interpret command');
      }

      setResult(data);
      // Initialize edited command with parsed command
      if (data.command) {
        setEditedCommand(JSON.parse(JSON.stringify(data.command)));
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [inputText]);

  const executeCommand = useCallback(async (withCorrection: boolean = false) => {
    if (!result?.logId) return;

    setIsLoading(true);
    setError(null);

    try {
      const payload: any = { execute: true };
      
      if (withCorrection && editedCommand && result.command) {
        // Send both original and corrected for learning
        payload.originalCommand = result.command;
        payload.correctedCommand = editedCommand;
        payload.logId = result.logId;
      } else {
        // Just execute the original
        payload.text = inputText;
        payload.execute = true;
      }

      const response = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to execute command');
      }

      setResult(data);
      setIsEditing(false);

      // Close after successful execution with a delay
      if (data.executionResult?.success) {
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [inputText, result, editedCommand, onClose]);

  const handleArgChange = (key: string, value: any) => {
    if (!editedCommand) return;
    setEditedCommand({
      ...editedCommand,
      args: {
        ...editedCommand.args,
        [key]: value
      }
    });
  };

  const handleCommandTypeChange = (newType: string) => {
    if (!editedCommand) return;
    setEditedCommand({
      ...editedCommand,
      command: newType
    });
  };

  const hasChanges = () => {
    if (!result?.command || !editedCommand) return false;
    return JSON.stringify(result.command) !== JSON.stringify(editedCommand);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (result && !result.executed) {
      if (isEditing && hasChanges()) {
        executeCommand(true); // Execute with correction
      } else {
        executeCommand(false); // Execute original
      }
    } else {
      interpretCommand();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className="flex min-h-full items-start justify-center p-4 pt-20">
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl transform transition-all">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">AI Command Console</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-4">
            <form onSubmit={handleSubmit}>
              {/* Input */}
              <div className="mb-4">
                <label htmlFor="command" className="block text-sm font-medium text-gray-700 mb-2">
                  Enter a natural language command
                </label>
                <input
                  type="text"
                  id="command"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder='e.g., "Purchased PE for 500" or "Leaf ordered 10 Herc"'
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                  autoFocus
                  disabled={isLoading || (result !== null && !result.executed)}
                />
              </div>

              {/* Error display */}
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex">
                    <svg className="h-5 w-5 text-red-400 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>
                  </div>
                </div>
              )}

              {/* Result display */}
              {result && (
                <div className={`mb-4 p-4 rounded-lg border ${
                  result.executionResult?.success 
                    ? 'bg-green-50 border-green-200' 
                    : result.executed 
                      ? 'bg-red-50 border-red-200'
                      : 'bg-blue-50 border-blue-200'
                }`}>
                  {result.executed ? (
                    // Execution result
                    <div>
                      <div className="flex items-center mb-2">
                        {result.executionResult?.success ? (
                          <svg className="h-5 w-5 text-green-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="h-5 w-5 text-red-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        )}
                        <span className={`font-medium ${result.executionResult?.success ? 'text-green-700' : 'text-red-700'}`}>
                          {result.executionResult?.success ? 'Command Executed Successfully' : 'Execution Failed'}
                        </span>
                        {result.correctionApplied && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                            Correction Saved
                          </span>
                        )}
                      </div>
                      <p className={`text-sm ${result.executionResult?.success ? 'text-green-600' : 'text-red-600'}`}>
                        {result.executionResult?.message}
                      </p>
                    </div>
                  ) : (
                    // Interpretation result with editable fields
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center">
                          <svg className="h-5 w-5 text-blue-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                          <span className="font-medium text-blue-700">Command Interpreted</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsEditing(!isEditing)}
                          className="text-sm text-blue-600 hover:text-blue-800 underline"
                        >
                          {isEditing ? 'Hide Editor' : 'Edit'}
                        </button>
                      </div>

                      {!isEditing ? (
                        // Summary view
                        <div>
                          <p className="text-sm text-blue-600 mb-1">
                            <strong>Action:</strong> {result.command?.command}
                          </p>
                          <p className="text-sm text-blue-600">
                            <strong>Summary:</strong> {result.summary}
                          </p>
                        </div>
                      ) : (
                        // Editable fields
                        <div className="space-y-3 mt-3">
                          {/* Command Type */}
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Command Type</label>
                            <select
                              value={editedCommand?.command || ''}
                              onChange={(e) => handleCommandTypeChange(e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                            >
                              {COMMAND_TYPES.map(ct => (
                                <option key={ct.value} value={ct.value}>{ct.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* Dynamic fields based on command type */}
                          {editedCommand && renderEditableFields(editedCommand, handleArgChange)}

                          {hasChanges() && (
                            <div className="flex items-center text-xs text-purple-600 mt-2">
                              <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Changes will be saved for future commands
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Example commands - only show when no result */}
              {!result && (
                <div className="mb-4 text-sm text-gray-500">
                  <p className="font-medium mb-1">Example commands:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>"Purchased PE for 500"</li>
                    <li>"Received 2kg lions mane powder"</li>
                    <li>"Leaf ordered 10 Herc and 5 MC caps"</li>
                    <li>"Batch HERC-44 yield 842 units"</li>
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (result && !result.executed) {
                      setResult(null);
                      setIsEditing(false);
                      setEditedCommand(null);
                    } else {
                      onClose();
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  disabled={isLoading}
                >
                  {result && !result.executed ? 'Back' : 'Cancel'}
                </button>
                
                {result && !result.executed ? (
                  <button
                    type="submit"
                    className={`px-4 py-2 text-sm font-medium text-white border border-transparent rounded-lg focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      hasChanges() 
                        ? 'bg-purple-600 hover:bg-purple-700 focus:ring-purple-500' 
                        : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                    }`}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Executing...' : hasChanges() ? 'Save Correction & Execute' : 'Confirm & Execute'}
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isLoading || !inputText.trim() || (result?.executed)}
                  >
                    {isLoading ? 'Interpreting...' : 'Interpret'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Render editable fields based on command type
 */
function renderEditableFields(
  command: ParsedCommand, 
  onChange: (key: string, value: any) => void
) {
  const { command: cmdType, args } = command;

  switch (cmdType) {
    case 'RECEIVE_MATERIAL':
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
              <input
                type="text"
                value={args.materialRef || ''}
                onChange={(e) => onChange('materialRef', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                placeholder="e.g., Penis Envy, PE, LM"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
              <input
                type="number"
                value={args.quantity || ''}
                onChange={(e) => onChange('quantity', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
              <select
                value={args.unit || 'UNIT'}
                onChange={(e) => onChange('unit', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              >
                <option value="UNIT">Unit</option>
                <option value="GRAM">Gram</option>
                <option value="KILOGRAM">Kilogram</option>
                <option value="MILLILITER">Milliliter</option>
                <option value="LITER">Liter</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Lot Number</label>
              <input
                type="text"
                value={args.lotNumber || ''}
                onChange={(e) => onChange('lotNumber', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                placeholder="Optional"
              />
            </div>
          </div>
        </>
      );

    case 'MOVE_INVENTORY':
      return (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Item</label>
            <input
              type="text"
              value={args.itemRef || ''}
              onChange={(e) => onChange('itemRef', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
            <input
              type="number"
              value={args.quantity || ''}
              onChange={(e) => onChange('quantity', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To Location</label>
            <input
              type="text"
              value={args.toLocationRef || ''}
              onChange={(e) => onChange('toLocationRef', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      );

    case 'ADJUST_INVENTORY':
      return (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Item</label>
            <input
              type="text"
              value={args.itemRef || ''}
              onChange={(e) => onChange('itemRef', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Delta (+/-)</label>
            <input
              type="number"
              value={args.delta || ''}
              onChange={(e) => onChange('delta', parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
            <input
              type="text"
              value={args.reason || ''}
              onChange={(e) => onChange('reason', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      );

    case 'CREATE_RETAILER_ORDER':
      return (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Retailer</label>
            <input
              type="text"
              value={args.retailerRef || ''}
              onChange={(e) => onChange('retailerRef', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Items (JSON)</label>
            <textarea
              value={JSON.stringify(args.items || [], null, 2)}
              onChange={(e) => {
                try {
                  onChange('items', JSON.parse(e.target.value));
                } catch {}
              }}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 font-mono"
              rows={3}
            />
          </div>
        </>
      );

    case 'COMPLETE_BATCH':
      return (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Batch Code</label>
            <input
              type="text"
              value={args.batchRef || ''}
              onChange={(e) => onChange('batchRef', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Yield Qty</label>
            <input
              type="number"
              value={args.yieldQuantity || ''}
              onChange={(e) => onChange('yieldQuantity', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Loss Qty</label>
            <input
              type="number"
              value={args.lossQuantity || ''}
              onChange={(e) => onChange('lossQuantity', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      );

    case 'CREATE_MATERIAL':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              type="text"
              value={args.name || ''}
              onChange={(e) => onChange('name', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">SKU</label>
            <input
              type="text"
              value={args.sku || ''}
              onChange={(e) => onChange('sku', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
              placeholder="Auto-generated if empty"
            />
          </div>
        </div>
      );

    default:
      return (
        <div className="text-sm text-gray-500">
          No editable fields for this command type
        </div>
      );
  }
}

/**
 * Hook to manage AI Command Bar state with keyboard shortcut
 */
export function useAiCommandBar() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev),
  };
}
