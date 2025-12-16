'use client';

import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
}

interface Props {
  user: User;
  onClose: () => void;
  onPasswordReset: () => void;
}

export default function ResetPasswordModal({ user, onClose, onPasswordReset }: Props) {
  const [mode, setMode] = useState<'generate' | 'manual'>('generate');
  const [manualPassword, setManualPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ tempPassword?: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const body = mode === 'manual' ? { password: manualPassword } : {};
      
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to reset password');
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Reset Password</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {!result ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-md text-sm">
                Resetting password for: <strong>{user.name}</strong> ({user.email})
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              {/* Mode Selection */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={mode === 'generate'}
                    onChange={() => setMode('generate')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-900">
                    Generate temporary password
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={mode === 'manual'}
                    onChange={() => setMode('manual')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm font-medium text-gray-900">
                    Set custom password
                  </span>
                </label>
              </div>

              {mode === 'manual' && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={manualPassword}
                    onChange={(e) => setManualPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Min 8 characters"
                  />
                  <p className="mt-1 text-xs text-gray-500">Minimum 8 characters</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50"
                >
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm">
                ✓ Password reset successfully
              </div>

              {result.tempPassword && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Temporary Password (save this now!)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={result.tempPassword}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                    />
                    <button
                      onClick={() => handleCopy(result.tempPassword!)}
                      className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      title="Copy to clipboard"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-red-600">
                    ⚠️ This password will not be shown again. Make sure to save it or send it to the user securely.
                  </p>
                </div>
              )}

              {!result.tempPassword && (
                <div className="text-sm text-gray-600">
                  The password has been set successfully. The user can now log in with their new password.
                </div>
              )}

              <div className="flex justify-end pt-4">
                <button
                  onClick={onPasswordReset}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

