'use client';

/**
 * System Seals Page
 * 
 * Admin-only page for:
 * - Seal Tuner (design configuration)
 * - Print Layout configuration
 * 
 * This is the "lab" where seal designs are configured.
 * The main /ops/seals page is the simplified operator interface.
 */

import { useState } from 'react';
import SealTunerPanel from '@/components/seals/SealTunerPanel';
import Link from 'next/link';

export default function SystemSealsPage() {
  const [isTunerOpen, setIsTunerOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Tuner Panel */}
      <SealTunerPanel 
        isOpen={isTunerOpen} 
        onClose={() => setIsTunerOpen(false)} 
      />
      
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Seal Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure seal designs and print layouts. Changes here affect all seal generation.
          </p>
        </div>
        <Link
          href="/ops/seals"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Seal Sheets
        </Link>
      </div>

      {/* Seal Tuner Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-medium text-gray-900">Seal Tuner</h2>
            <p className="text-sm text-gray-500 mt-1">
              Fine-tune the visual appearance of TripDAR seals. Adjust spore field density, 
              colors, QR code settings, and base layer styling.
            </p>
            <ul className="mt-3 text-sm text-gray-600 space-y-1">
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Live preview with TUNER_PREVIEW_001 token
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save experiments to Lab Notebook
              </li>
              <li className="flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Export calibration PDFs for print testing
              </li>
            </ul>
          </div>
          <button
            onClick={() => setIsTunerOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Open Seal Tuner
          </button>
        </div>
      </div>

      {/* Print Layout Info Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900">Print Layout</h2>
        <p className="text-sm text-gray-500 mt-1 mb-4">
          Print layout options are configured when generating or reprinting seal sheets.
        </p>
        
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Available Options</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Paper Sizes:</span>{' '}
              <span className="font-medium">Letter, A4, Custom</span>
            </div>
            <div>
              <span className="text-gray-500">Seal Diameters:</span>{' '}
              <span className="font-medium">0.75&quot;, 1.00&quot;, 1.25&quot;, 1.50&quot;</span>
            </div>
            <div>
              <span className="text-gray-500">Spacing:</span>{' '}
              <span className="font-medium">0.125&quot; to 1.00&quot;</span>
            </div>
            <div>
              <span className="text-gray-500">Registration Marks:</span>{' '}
              <span className="font-medium">Included for laser cutting</span>
            </div>
          </div>
        </div>
        
        <div className="mt-4">
          <Link
            href="/ops/seals"
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            Go to Seal Sheets to generate or print
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Quick Reference */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-amber-800 mb-2">Admin Note</h3>
        <p className="text-sm text-amber-700">
          This page is only accessible to administrators. The Seal Tuner allows you to 
          experiment with seal designs without affecting production. Use the Lab Notebook 
          to save promising configurations, then export calibration PDFs to test print quality 
          before committing to a design.
        </p>
      </div>
    </div>
  );
}

