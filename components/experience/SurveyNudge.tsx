'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface SurveyNudgeProps {
  onDismiss: () => void;
  onStart: () => void;
}

export function SurveyNudge({ onDismiss, onStart }: SurveyNudgeProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [timeElapsed, setTimeElapsed] = useState(0);
  
  useEffect(() => {
    // Show after 12-20 seconds OR 60% scroll
    const checkScroll = () => {
      const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      if (scrollPercent >= 60) {
        setHasScrolled(true);
        setIsVisible(true);
      }
    };
    
    const timer = setInterval(() => {
      setTimeElapsed(prev => {
        const newTime = prev + 1;
        if (newTime >= 12 && newTime <= 20) {
          setIsVisible(true);
        }
        return newTime;
      });
    }, 1000);
    
    window.addEventListener('scroll', checkScroll);
    
    return () => {
      clearInterval(timer);
      window.removeEventListener('scroll', checkScroll);
    };
  }, []);
  
  if (!isVisible) return null;
  
  return (
    <div className="fixed bottom-4 right-4 max-w-sm bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50 animate-in slide-in-from-bottom-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900 mb-1">Share your experience</h4>
          <p className="text-sm text-gray-600 mb-3">
            Help us improve by sharing how this product matched your expectations.
          </p>
          <button
            onClick={onStart}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Start Survey
          </button>
        </div>
        <button
          onClick={() => {
            setIsVisible(false);
            onDismiss();
          }}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

