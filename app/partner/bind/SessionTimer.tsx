'use client';

/**
 * SessionTimer - Countdown timer for binding sessions
 * 
 * Features:
 * - Shows remaining time in MM:SS format
 * - Amber warning color when <30 seconds remain
 * - No sound/vibration on color change (subtle visual only)
 * - Calls onExpired when timer reaches 0
 */

import { useState, useEffect } from 'react';

interface SessionTimerProps {
  expiresAt: string;
  onExpired: () => void;
}

export function SessionTimer({ expiresAt, onExpired }: SessionTimerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(() => {
    const expiresDate = new Date(expiresAt);
    const now = new Date();
    return Math.max(0, Math.floor((expiresDate.getTime() - now.getTime()) / 1000));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const expiresDate = new Date(expiresAt);
      const now = new Date();
      const remaining = Math.max(0, Math.floor((expiresDate.getTime() - now.getTime()) / 1000));
      
      setRemainingSeconds(remaining);

      if (remaining === 0) {
        clearInterval(interval);
        onExpired();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Determine color based on remaining time
  const isWarning = remainingSeconds <= 30;
  const isCritical = remainingSeconds <= 10;

  let bgColor = 'bg-gray-100';
  let textColor = 'text-gray-900';
  
  if (isCritical) {
    bgColor = 'bg-red-100';
    textColor = 'text-red-700';
  } else if (isWarning) {
    bgColor = 'bg-amber-100';
    textColor = 'text-amber-700';
  }

  return (
    <div className={`${bgColor} px-3 py-1 rounded-lg transition-colors duration-300`}>
      <span className={`text-lg font-mono font-bold ${textColor}`}>
        {formattedTime}
      </span>
    </div>
  );
}

