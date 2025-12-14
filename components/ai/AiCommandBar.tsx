'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// QR Context from scanned/pasted QR code
interface QRContext {
  type: 'QR_CONTEXT';
  tokenId: string;
  tokenValue: string;
  entityType: string;
  entityId: string;
  entityName: string;
  entityLink: string | null;
  labelVersion: string | null;
  currentRedirect: {
    type: 'TOKEN' | 'GROUP' | 'DEFAULT';
    url: string;
    ruleName: string | null;
  };
  status: string;
  scanCount: number;
  lastScanned: string | null;
}

interface QRResolveResult {
  found: boolean;
  qrContext?: QRContext;
  suggestedActions?: Array<{ action: string; label: string; link: string }>;
  summary?: string;
  message?: string;
}

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
  type?: 'NAVIGATION' | 'PROPOSE_CREATE';
  destination?: string;
  prefill?: Record<string, unknown>;
  message?: string;
  entity?: 'strain' | 'material';
  confirmationText?: string;
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
  { value: 'NAVIGATE_ADD_STRAIN', label: 'Navigate: Add Strain' },
  { value: 'NAVIGATE_ADD_MATERIAL', label: 'Navigate: Add Material' },
];

export default function AiCommandBar({ isOpen, onClose }: AiCommandBarProps) {
  const router = useRouter();
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCommand, setEditedCommand] = useState<ParsedCommand | null>(null);
  const [qrContext, setQrContext] = useState<QRResolveResult | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setInputText('');
      setResult(null);
      setError(null);
      setIsEditing(false);
      setEditedCommand(null);
      setQrContext(null);
    }
  }, [isOpen]);

  // Check for QR pattern in input
  const detectQRPattern = (text: string): boolean => {
    return /qr_[A-Za-z0-9]{22}/.test(text) || /\/qr\/qr_[A-Za-z0-9]+/.test(text);
  };

  // Resolve QR context
  const resolveQRContext = useCallback(async (text: string) => {
    if (!detectQRPattern(text)) {
      setQrContext(null);
      return null;
    }

    try {
      const response = await fetch('/api/qr-tokens/resolve-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text })
      });
      
      if (response.ok) {
        const data: QRResolveResult = await response.json();
        setQrContext(data);
        return data;
      }
    } catch {
      // Silently fail QR detection
    }
    return null;
  }, []);

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
      // First check if input contains a QR pattern
      const qrResult = await resolveQRContext(inputText);
      
      if (qrResult?.found && qrResult.qrContext) {
        // QR detected - show QR context UI instead of command interpretation
        setIsLoading(false);
        return;
      }

      // Normal command interpretation
      const response = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, execute: false }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to interpret command');
      }

      // Phase 1: navigation response (route + optional prefill)
      if (data?.type === 'NAVIGATION' && typeof data.destination === 'string') {
        const params = new URLSearchParams();
        if (data.prefill && typeof data.prefill === 'object') {
          params.set('prefill', JSON.stringify(data.prefill));
        }
        params.set('aiToast', '1');

        const needsQuestionMark = !data.destination.includes('?');
        const withQuery = `${data.destination}${needsQuestionMark ? '?' : '&'}${params.toString()}`;
        router.push(withQuery);
        onClose();
        return;
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
  }, [inputText, resolveQRContext, router, onClose]);

  const confirmProposedCreate = useCallback(async () => {
    if (!result?.logId || result.type !== 'PROPOSE_CREATE') return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: true,
          logId: result.logId,
          proposedAction: {
            type: 'PROPOSE_CREATE',
            entity: result.entity,
            prefill: result.prefill || {},
            confirmationText: result.confirmationText,
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to create');
      }

      if (data?.type === 'NAVIGATION' && typeof data.destination === 'string') {
        router.push(data.destination);
        onClose();
        return;
      }

      // Fallback: show returned payload
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [result, router, onClose]);

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
    // If QR context is shown, don't process further
    if (qrContext?.found) {
      return;
    }
    // PROPOSE_CREATE uses explicit buttons (Create/Cancel), not form submit.
    if (result?.type === 'PROPOSE_CREATE') {
      return;
    }
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
                      {result.type === 'PROPOSE_CREATE' ? (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <svg className="h-5 w-5 text-blue-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                              <span className="font-medium text-blue-700">Review & Confirm</span>
                            </div>
                            <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                              No data written yet
                            </span>
                          </div>

                          <p className="text-sm text-blue-700 whitespace-pre-wrap">
                            {result.confirmationText ||
                              `I’ve prepared a new ${result.entity || 'entity'}.\nPlease review and confirm before it’s created.`}
                          </p>

                          {result.prefill && (
                            <div className="mt-3 bg-white/70 border border-blue-200 rounded p-3">
                              <div className="text-xs font-medium text-blue-800 mb-2">Proposed values</div>
                              <pre className="text-xs text-blue-900 whitespace-pre-wrap">
                                {JSON.stringify(result.prefill, null, 2)}
                              </pre>
                            </div>
                          )}
                          {result.entity === 'strain' &&
                            result.prefill &&
                            typeof result.prefill === 'object' &&
                            (result.prefill as Record<string, unknown>)['shortCodeNeedsManual'] === true && (
                              <p className="mt-2 text-xs text-amber-700">
                                AI couldn’t safely suggest a short code — please choose one.
                              </p>
                            )}
                        </div>
                      ) : (
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
                </div>
              )}

              {/* QR Context Display */}
              {qrContext?.found && qrContext.qrContext && (
                <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    <span className="font-medium text-purple-800">QR Token Detected</span>
                    <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
                      qrContext.qrContext.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                      qrContext.qrContext.status === 'REVOKED' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {qrContext.qrContext.status}
                    </span>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <p className="text-purple-700">{qrContext.summary}</p>
                    
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-purple-200">
                      <div>
                        <span className="text-xs text-purple-500">Entity</span>
                        <p className="text-purple-800 font-medium">{qrContext.qrContext.entityName}</p>
                      </div>
                      <div>
                        <span className="text-xs text-purple-500">Type</span>
                        <p className="text-purple-800">{qrContext.qrContext.entityType}</p>
                      </div>
                      <div>
                        <span className="text-xs text-purple-500">Scans</span>
                        <p className="text-purple-800">{qrContext.qrContext.scanCount}</p>
                      </div>
                      <div>
                        <span className="text-xs text-purple-500">Redirect</span>
                        <p className="text-purple-800">{qrContext.qrContext.currentRedirect.type}</p>
                      </div>
                    </div>
                  </div>

                  {/* Suggested Actions */}
                  {qrContext.suggestedActions && qrContext.suggestedActions.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-purple-200">
                      <span className="text-xs text-purple-500 block mb-2">Quick Actions</span>
                      <div className="flex flex-wrap gap-2">
                        {qrContext.suggestedActions.map((action) => (
                          <Link
                            key={action.action}
                            href={action.link}
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-white border border-purple-300 rounded-md hover:bg-purple-100"
                          >
                            {action.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Example commands - only show when no result and no QR context */}
              {!result && !qrContext?.found && (
                <div className="mb-4 text-sm text-gray-500">
                  <p className="font-medium mb-1">Example commands:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>"Purchased PE for 500"</li>
                    <li>"Received 2kg lions mane powder"</li>
                    <li>"Leaf ordered 10 Herc and 5 MC caps"</li>
                    <li>"Batch HERC-44 yield 842 units"</li>
                    <li className="text-purple-600">Paste a QR URL or token to view details</li>
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (qrContext?.found) {
                      setQrContext(null);
                      setInputText('');
                      setResult(null);
                    } else if (result && !result.executed) {
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
                  {qrContext?.found ? 'Clear' : result && !result.executed ? 'Cancel' : 'Cancel'}
                </button>
                
                {qrContext?.found && qrContext.qrContext ? (
                  <Link
                    href={`/qr/${qrContext.qrContext.tokenId}`}
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-lg hover:bg-purple-700 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                  >
                    Open QR Details
                  </Link>
                ) : result?.type === 'PROPOSE_CREATE' ? (
                  <button
                    type="button"
                    onClick={() => {
                      // Short-code safety: if AI could not safely suggest a shortCode, route to the form.
                      const needsManualShortCode =
                        result.entity === 'strain' &&
                        !!result.prefill &&
                        typeof result.prefill === 'object' &&
                        (result.prefill as Record<string, unknown>)['shortCodeNeedsManual'] === true;

                      if (needsManualShortCode) {
                        const params = new URLSearchParams();
                        const name = (result.prefill as Record<string, unknown>)['name'];
                        if (typeof name === 'string') params.set('prefill', JSON.stringify({ name }));
                        params.set('aiToast', '1');
                        router.push(`/strains/new?${params.toString()}`);
                        onClose();
                        return;
                      }

                      confirmProposedCreate();
                    }}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Creating...' : 'Create'}
                  </button>
                ) : result && !result.executed ? (
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
