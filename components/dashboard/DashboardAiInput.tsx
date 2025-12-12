'use client';

import { useState, useCallback } from 'react';

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
  resolved?: Record<string, unknown>;
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
    details?: unknown;
  };
  correctionApplied?: boolean;
  error?: string;
}

const EXAMPLES = [
  'Purchased PE for 500',
  'Start production for Golden Teacher',
  'Move batch B-102 to finished goods',
  'Received 2kg lions mane powder',
];

export default function DashboardAiInput() {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setInputText('');
    setResult(null);
    setError(null);
  }, []);

  const interpretCommand = useCallback(async () => {
    if (!inputText.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [inputText]);

  const executeCommand = useCallback(async () => {
    if (!result?.logId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, execute: true }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to execute command');
      }

      setResult(data);

      // Auto-reset after successful execution
      if (data.executionResult?.success) {
        setTimeout(() => {
          reset();
        }, 2500);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, result, reset]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (result && !result.executed) {
      executeCommand();
    } else {
      interpretCommand();
    }
  };

  const handleExampleClick = (example: string) => {
    setInputText(example);
    setResult(null);
    setError(null);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <form onSubmit={handleSubmit}>
        {/* Input Row */}
        <div className="flex gap-3">
          <div className="flex-1 relative bg-white">
            <input
              type="text"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                if (result) {
                  setResult(null);
                  setError(null);
                }
              }}
              placeholder="Type a command..."
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
              disabled={isLoading}
              autoFocus
            />
            {isLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
          </div>
          
          {result && !result.executed ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={reset}
                className="px-4 py-3 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-3 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                disabled={isLoading}
              >
                {isLoading ? 'Running...' : 'Confirm'}
              </button>
            </div>
          ) : (
            <button
              type="submit"
              className="px-5 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={isLoading || !inputText.trim() || result?.executed}
            >
              {isLoading ? 'Processing...' : 'Go'}
            </button>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div className={`mt-3 p-3 rounded-lg border ${
            result.executionResult?.success 
              ? 'bg-green-50 border-green-200' 
              : result.executed 
                ? 'bg-red-50 border-red-200'
                : 'bg-blue-50 border-blue-200'
          }`}>
            {result.executed ? (
              <div className="flex items-center gap-2">
                {result.executionResult?.success ? (
                  <>
                    <svg className="h-5 w-5 text-green-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-green-700">{result.executionResult?.message}</span>
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5 text-red-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm text-red-700">{result.executionResult?.message || 'Execution failed'}</span>
                  </>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <svg className="h-4 w-4 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-medium text-blue-700">Ready to execute</span>
                </div>
                <p className="text-sm text-blue-600">{result.summary}</p>
              </div>
            )}
          </div>
        )}

        {/* Examples - only show when no result */}
        {!result && !error && (
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-gray-500 mr-1">Try:</span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => handleExampleClick(example)}
                className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}

