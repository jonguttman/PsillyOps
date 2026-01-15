'use client';

/**
 * Tuner Scan Notifier
 * 
 * Client component that notifies the tuner panel when a seal is scanned.
 * Only rendered for TUNER_PREVIEW tokens.
 * 
 * Sends a POST to /api/seals/tuner/scan-notify on mount.
 */

import { useEffect, useState } from 'react';

interface TunerScanNotifierProps {
  token: string;
}

export function TunerScanNotifier({ token }: TunerScanNotifierProps) {
  const [notified, setNotified] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  useEffect(() => {
    if (notified) return;
    
    const notify = async () => {
      try {
        await fetch('/api/seals/tuner/scan-notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            userAgent: navigator.userAgent,
          }),
        });
        
        setNotified(true);
        setShowSuccess(true);
        
        // Provide haptic feedback if available
        if ('vibrate' in navigator) {
          navigator.vibrate([100, 50, 100]); // Success pattern
        }
        
        // Hide success indicator after 3 seconds
        setTimeout(() => setShowSuccess(false), 3000);
      } catch (error) {
        console.error('Failed to notify tuner:', error);
      }
    };
    
    notify();
  }, [token, notified]);
  
  if (!showSuccess) return null;
  
  return (
    <div className="fixed top-4 right-4 z-50 animate-pulse">
      <div className="bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-sm font-medium">Scan recorded in Tuner</span>
      </div>
    </div>
  );
}

