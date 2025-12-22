'use client';

/**
 * Seal Tuner Panel
 * 
 * Slide-out panel for tuning TripDAR seal spore field configuration.
 * 
 * Features:
 * - Live SVG preview with TUNER_PREVIEW_001 token
 * - Preset buttons (named, not numbered)
 * - Dynamic controls per preset with hover tooltips
 * - Save child presets
 * - DPI simulation
 * - Scan safety overlay
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { SporeFieldConfig, BasePresetId, BaseLayerConfig } from '@/lib/types/sealConfig';
import { CONTROL_TOOLTIPS } from '@/lib/types/sealConfig';
import { PRESET_DEFINITIONS, getPresetIds, clonePresetDefaults } from '@/lib/constants/sealPresets';

interface SealTunerPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// Tooltip component - uses fixed positioning to escape overflow containers
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  
  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Position tooltip to the LEFT of the trigger, vertically centered
      setPosition({
        top: rect.top + rect.height / 2 - 20,
        left: rect.left - 270, // 256px width + 14px gap
      });
    }
    setShow(true);
  };
  
  return (
    <div className="relative inline-block">
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShow(false)}
      >
        {children}
      </div>
      {show && (
        <div 
          className="fixed z-[9999] w-64 p-2 text-xs bg-gray-900 text-white rounded shadow-lg"
          style={{ top: position.top, left: position.left }}
        >
          {text}
          <div className="absolute w-2 h-2 bg-gray-900 rotate-45 -right-1 top-5" />
        </div>
      )}
    </div>
  );
}

// Slider control with tooltip
interface SliderControlProps {
  label: string;
  tooltipKey: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  format?: (v: number) => string;
}

function SliderControl({ 
  label, tooltipKey, value, min, max, step, onChange, disabled, format 
}: SliderControlProps) {
  const tooltip = CONTROL_TOOLTIPS[tooltipKey] || `Adjust ${label}`;
  const displayValue = format ? format(value) : value.toFixed(2);
  
  return (
    <div className={`mb-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex justify-between items-center mb-1">
        <Tooltip text={tooltip}>
          <label className="text-sm font-medium text-gray-700 cursor-help flex items-center gap-1">
            {label}
            <span className="text-gray-400 text-xs">ⓘ</span>
          </label>
        </Tooltip>
        <span className="text-sm text-gray-500">{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
      />
    </div>
  );
}

// Color palette - curated 30 colors
const COLOR_PALETTE = [
  // Row 1: Blacks, grays, whites
  '#000000', '#1a1a1a', '#333333', '#4d4d4d', '#666666', '#808080',
  '#999999', '#b3b3b3', '#cccccc', '#e6e6e6', '#f5f5f5', '#ffffff',
  // Row 2: Warm colors
  '#8b0000', '#b22222', '#dc143c', '#ff4500', '#ff6347', '#ff7f50',
  // Row 3: Cool colors
  '#000080', '#0000cd', '#4169e1', '#1e90ff', '#00bfff', '#87ceeb',
  // Row 4: Greens and purples
  '#006400', '#228b22', '#32cd32', '#4b0082', '#8b008b', '#9932cc',
];

// Palette color picker
interface PalettePickerProps {
  value: string;
  onChange: (color: string) => void;
}

function PalettePicker({ value, onChange }: PalettePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);
  
  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-8 rounded border-2 border-gray-300 cursor-pointer hover:border-gray-400 transition-colors"
        style={{ backgroundColor: value }}
        title={value}
      />
      {isOpen && (
        <div className="absolute top-10 left-0 z-50 p-2 bg-white rounded-lg shadow-xl border w-48">
          <div className="grid grid-cols-6 gap-1">
            {COLOR_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  onChange(color);
                  setIsOpen(false);
                }}
                className={`w-6 h-6 rounded border transition-transform hover:scale-110 ${
                  value === color ? 'ring-2 ring-blue-500 ring-offset-1' : 'border-gray-200'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Color picker with tooltip - now uses palette
interface ColorControlProps {
  label: string;
  tooltipKey: string;
  color: string;
  opacity: number;
  onColorChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
}

function ColorControl({ 
  label, tooltipKey, color, opacity, onColorChange, onOpacityChange 
}: ColorControlProps) {
  const tooltip = CONTROL_TOOLTIPS[tooltipKey] || `Adjust ${label}`;
  
  return (
    <div className="mb-4">
      <Tooltip text={tooltip}>
        <label className="text-sm font-medium text-gray-700 cursor-help flex items-center gap-1 mb-2">
          {label}
          <span className="text-gray-400 text-xs">ⓘ</span>
        </label>
      </Tooltip>
      <div className="flex gap-2 items-center">
        <PalettePicker value={color} onChange={onColorChange} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-xs text-gray-500 w-12">{(opacity * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

// Collapsible section component
interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="mb-6 border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left transition-colors"
      >
        <h3 className="text-sm font-semibold">{title}</h3>
        <svg 
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="p-4 border-t">
          {children}
        </div>
      )}
    </div>
  );
}

export default function SealTunerPanel({ isOpen, onClose }: SealTunerPanelProps) {
  const [selectedPreset, setSelectedPreset] = useState<BasePresetId>('material-unified');
  const [config, setConfig] = useState<SporeFieldConfig>(() => 
    clonePresetDefaults('material-unified')
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [dpiSimulation, setDpiSimulation] = useState<number | null>(null);
  const [presetName, setPresetName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSizes, setExportSizes] = useState<number[]>([1.25, 1.5, 2.0]);
  const [exportPaper, setExportPaper] = useState<'letter' | 'a4'>('letter');
  const [scanEvents, setScanEvents] = useState<{ timestamp: string; success: boolean }[]>([]);
  
  const previewRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  
  // Fetch preview when config changes (debounced)
  // Returns a blob URL for use with <img> tag (cleaner than dangerouslySetInnerHTML)
  const fetchPreview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/seals/tuner/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate preview');
      }
      
      let svg = await response.text();
      
      // Strip XML declaration if present - it can cause issues with blob URLs in some browsers
      svg = svg.replace(/^<\?xml[^?]*\?>\s*/i, '');
      
      // Convert SVG string to blob URL for <img> rendering
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      
      // Revoke previous URL to prevent memory leaks
      setPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [config]);
  
  // Debounced preview fetch
  useEffect(() => {
    if (!isOpen) return;
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(() => {
      fetchPreview();
    }, 300);
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [config, isOpen, fetchPreview]);
  
  // Cleanup blob URL when panel closes or component unmounts
  useEffect(() => {
    return () => {
      setPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);
  
  // SSE connection for scan events
  useEffect(() => {
    if (!isOpen) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }
    
    const eventSource = new EventSource('/api/seals/tuner/scan-events');
    eventSourceRef.current = eventSource;
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'scan') {
          setScanEvents(prev => [
            { timestamp: data.timestamp, success: data.success },
            ...prev.slice(0, 4), // Keep last 5
          ]);
          
          // Visual feedback
          if (previewRef.current) {
            previewRef.current.classList.add('ring-4', 'ring-green-400');
            setTimeout(() => {
              previewRef.current?.classList.remove('ring-4', 'ring-green-400');
            }, 500);
          }
        }
      } catch (e) {
        // Ignore parse errors (heartbeats, etc.)
      }
    };
    
    eventSource.onerror = () => {
      console.log('SSE connection error, will retry...');
    };
    
    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [isOpen]);
  
  // Handle preset change
  const handlePresetChange = (presetId: BasePresetId) => {
    setSelectedPreset(presetId);
    setConfig(clonePresetDefaults(presetId));
  };
  
  // Update config helper
  const updateConfig = (updates: Partial<SporeFieldConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };
  
  // Update base layer config helper
  const updateBaseLayer = (
    layer: keyof BaseLayerConfig, 
    field: 'color' | 'opacity' | 'strokeWidth' | 'strokeColor' | 'aboveQr', 
    value: string | number | boolean
  ): void => {
    setConfig(prev => ({
      ...prev,
      baseLayerConfig: {
        ...prev.baseLayerConfig,
        [layer]: {
          ...prev.baseLayerConfig[layer],
          [field]: value,
        },
      },
    }));
  };
  
  // Save preset
  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      alert('Please enter a preset name');
      return;
    }
    
    setIsSaving(true);
    try {
      const response = await fetch('/api/seals/tuner/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: presetName.trim(),
          description: `Child of ${PRESET_DEFINITIONS[selectedPreset].meta.displayName}`,
          config,
        }),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to save preset');
      }
      
      alert('Preset saved successfully!');
      setPresetName('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save preset');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Export calibration PDF
  const handleExportPdf = async () => {
    if (exportSizes.length === 0) {
      alert('Please select at least one size');
      return;
    }
    
    setIsExporting(true);
    try {
      const response = await fetch('/api/seals/tuner/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          sizes: exportSizes,
          paperSize: exportPaper,
        }),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to export PDF');
      }
      
      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seal-calibration-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };
  
  // Toggle export size
  const toggleExportSize = (size: number) => {
    setExportSizes(prev => 
      prev.includes(size) 
        ? prev.filter(s => s !== size)
        : [...prev, size].sort((a, b) => a - b)
    );
  };
  
  // Get enabled controls for current preset
  const enabledControls = PRESET_DEFINITIONS[selectedPreset].meta.enabledControls;
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="relative ml-auto w-full max-w-2xl bg-white shadow-xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold">Seal Tuner</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content - flex container with sticky preview and scrollable controls */}
        <div className="flex-1 flex overflow-hidden">
          {/* Preview Section - sticky/fixed on left */}
          <div className="w-1/2 p-4 border-r bg-gray-50 overflow-y-auto">
              <h3 className="text-sm font-semibold mb-2">Preview</h3>
              
              {/* Preview container */}
              <div 
                ref={previewRef}
                className="relative aspect-square bg-white rounded border overflow-hidden"
                style={dpiSimulation ? {
                  imageRendering: 'pixelated',
                  filter: `blur(${Math.max(0, (300 - dpiSimulation) / 100)}px)`,
                } : undefined}
              >
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  </div>
                )}
                {error && (
                  <div className="absolute inset-0 flex items-center justify-center bg-red-50 text-red-600 text-sm p-4">
                    {error}
                  </div>
                )}
                {previewUrl && !error && (
                  <img 
                    src={previewUrl}
                    alt="Seal preview"
                    className="w-full h-full object-contain"
                  />
                )}
                
                {/* Scan Safety Overlay */}
                {showOverlay && (
                  <div className="absolute inset-0 pointer-events-none">
                    <svg viewBox="0 0 1000 1000" className="w-full h-full">
                      {/* Zone A - QR Core (red) */}
                      <circle 
                        cx="500" cy="500" 
                        r={230 * (config.qrScale ?? 1) * (config.zoneAEnd ?? 0.4)} 
                        fill="rgba(255,0,0,0.2)" 
                        stroke="red" 
                        strokeWidth="2" 
                        strokeDasharray="4"
                      />
                      {/* Zone B - Transition (yellow) */}
                      <circle 
                        cx="500" cy="500" 
                        r={230 * (config.qrScale ?? 1) * (config.zoneBEnd ?? 0.7)} 
                        fill="none" 
                        stroke="orange" 
                        strokeWidth="2" 
                        strokeDasharray="4"
                      />
                      {/* QR Boundary (blue) */}
                      <circle 
                        cx="500" cy="500" 
                        r={230 * (config.qrScale ?? 1)} 
                        fill="none" 
                        stroke="blue" 
                        strokeWidth="2"
                      />
                    </svg>
                  </div>
                )}
              </div>
              
              {/* Preview controls */}
              <div className="mt-4 space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showOverlay}
                    onChange={(e) => setShowOverlay(e.target.checked)}
                    className="rounded"
                  />
                  Show scan safety overlay
                </label>
                
                <div>
                  <label className="text-sm text-gray-600 block mb-1">DPI Simulation</label>
                  <select
                    value={dpiSimulation ?? ''}
                    onChange={(e) => setDpiSimulation(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-2 py-1 border rounded text-sm"
                  >
                    <option value="">None (crisp)</option>
                    <option value="300">300 DPI (print)</option>
                    <option value="150">150 DPI (low print)</option>
                    <option value="72">72 DPI (screen)</option>
                  </select>
                </div>
              </div>
              
              {/* Scan Test Results */}
              <div className="mt-4">
                <h4 className="text-xs font-semibold text-gray-500 mb-2">Recent Scan Tests</h4>
                {scanEvents.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">
                    Scan the preview QR to test scan reliability...
                  </p>
                ) : (
                  <div className="space-y-1">
                    {scanEvents.map((event, i) => (
                      <div 
                        key={event.timestamp}
                        className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                          event.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${
                          event.success ? 'bg-green-500' : 'bg-red-500'
                        }`} />
                        <span>
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="text-gray-400">
                          {event.success ? '✓ Scanned' : '✗ Failed'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            {/* Controls Section */}
            <div className="w-1/2 p-4 overflow-y-auto">
              {/* Preset Buttons */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-2">Base Preset</h3>
                <div className="grid grid-cols-2 gap-2">
                  {getPresetIds().map((id) => {
                    const preset = PRESET_DEFINITIONS[id];
                    return (
                      <button
                        key={id}
                        onClick={() => handlePresetChange(id)}
                        className={`p-2 text-left rounded border transition-colors ${
                          selectedPreset === id
                            ? 'bg-blue-50 border-blue-500 text-blue-700'
                            : 'bg-white border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        <div className="font-medium text-sm">{preset.meta.displayName}</div>
                        <div className="text-xs text-gray-500 truncate">{preset.meta.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              
              {/* Core Controls (all presets) */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-2">Core Density</h3>
                
                <SliderControl
                  label="Spore Count"
                  tooltipKey="sporeCount"
                  value={config.sporeCount}
                  min={10000}
                  max={100000}
                  step={5000}
                  onChange={(v) => updateConfig({ sporeCount: v })}
                  format={(v) => v.toLocaleString()}
                />
                
                <SliderControl
                  label="Min Opacity"
                  tooltipKey="minOpacity"
                  value={config.minOpacity}
                  min={0}
                  max={0.5}
                  step={0.01}
                  onChange={(v) => updateConfig({ minOpacity: v })}
                />
                
                <SliderControl
                  label="Max Opacity"
                  tooltipKey="maxOpacity"
                  value={config.maxOpacity}
                  min={0.3}
                  max={1}
                  step={0.01}
                  onChange={(v) => updateConfig({ maxOpacity: v })}
                />
              </div>
              
              {/* Zone Controls */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-2">Zone Boundaries</h3>
                
                <SliderControl
                  label="Zone A End (QR Core)"
                  tooltipKey="zoneAEnd"
                  value={config.zoneAEnd}
                  min={0.2}
                  max={0.6}
                  step={0.05}
                  onChange={(v) => updateConfig({ zoneAEnd: v })}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                />
                
                <SliderControl
                  label="Zone B End (Transition)"
                  tooltipKey="zoneBEnd"
                  value={config.zoneBEnd}
                  min={0.5}
                  max={0.9}
                  step={0.05}
                  onChange={(v) => updateConfig({ zoneBEnd: v })}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                />
              </div>
              
              {/* QR Settings - Collapsible */}
              <CollapsibleSection title="QR Settings" defaultOpen={true}>
                <SliderControl
                  label="Scale"
                  tooltipKey="qrScale"
                  value={config.qrScale ?? 1.0}
                  min={0.5}
                  max={1.5}
                  step={0.05}
                  onChange={(v) => updateConfig({ qrScale: v })}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                />
                
                <SliderControl
                  label="Rotation"
                  tooltipKey="qrRotation"
                  value={config.qrRotation ?? 0}
                  min={0}
                  max={360}
                  step={5}
                  onChange={(v) => updateConfig({ qrRotation: v })}
                  format={(v) => `${v.toFixed(0)}°`}
                />
                
                <div className="mb-4">
                  <Tooltip text={CONTROL_TOOLTIPS.qrDotColor || 'Color of the QR code dots'}>
                    <label className="text-sm font-medium text-gray-700 cursor-help flex items-center gap-1 mb-2">
                      Dot Color
                      <span className="text-gray-400 text-xs">ⓘ</span>
                    </label>
                  </Tooltip>
                  <PalettePicker 
                    value={config.qrDotColor ?? '#000000'} 
                    onChange={(c) => updateConfig({ qrDotColor: c })} 
                  />
                </div>
                
                <SliderControl
                  label="Dot Size"
                  tooltipKey="qrDotSize"
                  value={config.qrDotSize ?? 1.0}
                  min={0.5}
                  max={1.2}
                  step={0.02}
                  onChange={(v) => updateConfig({ qrDotSize: v })}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                />
                
                <div className="mb-4">
                  <Tooltip text={CONTROL_TOOLTIPS.qrDotShape || 'Shape of QR dots'}>
                    <label className="text-sm font-medium text-gray-700 cursor-help flex items-center gap-1 mb-2">
                      Dot Shape
                      <span className="text-gray-400 text-xs">ⓘ</span>
                    </label>
                  </Tooltip>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateConfig({ qrDotShape: 'circle' })}
                      className={`flex-1 px-3 py-2 rounded border text-sm font-medium transition-colors ${
                        (config.qrDotShape ?? 'circle') === 'circle'
                          ? 'bg-blue-50 border-blue-500 text-blue-700'
                          : 'bg-white border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      ● Circle
                    </button>
                    <button
                      onClick={() => updateConfig({ qrDotShape: 'diamond' })}
                      className={`flex-1 px-3 py-2 rounded border text-sm font-medium transition-colors ${
                        config.qrDotShape === 'diamond'
                          ? 'bg-blue-50 border-blue-500 text-blue-700'
                          : 'bg-white border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      ◆ Diamond
                    </button>
                  </div>
                </div>
                
                {/* Error Correction Level */}
                <SliderControl
                  label="Error Correction"
                  tooltipKey="qrErrorCorrection"
                  value={config.qrErrorCorrection ?? 15}
                  min={7}
                  max={30}
                  step={1}
                  onChange={(v) => updateConfig({ qrErrorCorrection: v })}
                  format={(v) => {
                    // Show the actual QR level that will be used
                    let level: string;
                    if (v < 11) level = 'L (7%)';
                    else if (v < 20) level = 'M (15%)';
                    else if (v < 27.5) level = 'Q (25%)';
                    else level = 'H (30%)';
                    return `${v}% → ${level}`;
                  }}
                />
                
                {/* Quiet Core - scan safety controls */}
                {enabledControls.quietCoreFactor && (
                  <>
                    <div className="border-t my-4 pt-4">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Scan Safety</div>
                    </div>
                    
                    <SliderControl
                      label="Quiet Core Factor"
                      tooltipKey="quietCoreFactor"
                      value={config.quietCoreFactor ?? 0.55}
                      min={0.3}
                      max={0.7}
                      step={0.05}
                      onChange={(v) => updateConfig({ quietCoreFactor: v })}
                      format={(v) => `${(v * 100).toFixed(0)}%`}
                    />
                    
                    {enabledControls.finderExclusionMultiplier && (
                      <SliderControl
                        label="Finder Exclusion"
                        tooltipKey="finderExclusionMultiplier"
                        value={config.finderExclusionMultiplier ?? 1.25}
                        min={1.0}
                        max={2.0}
                        step={0.05}
                        onChange={(v) => updateConfig({ finderExclusionMultiplier: v })}
                        format={(v) => `${v.toFixed(2)}×`}
                      />
                    )}
                  </>
                )}
              </CollapsibleSection>
              
              {/* Spore Cloud Appearance - Collapsible */}
              <CollapsibleSection title="Spore Cloud" defaultOpen={false}>
                <div className="mb-4">
                  <Tooltip text={CONTROL_TOOLTIPS.sporeColor || 'Primary color of spore particles'}>
                    <label className="text-sm font-medium text-gray-700 cursor-help flex items-center gap-1 mb-2">
                      Primary Color
                      <span className="text-gray-400 text-xs">ⓘ</span>
                    </label>
                  </Tooltip>
                  <PalettePicker 
                    value={config.sporeColor ?? '#000000'} 
                    onChange={(c) => updateConfig({ sporeColor: c })} 
                  />
                </div>
                
                <div className="mb-4">
                  <Tooltip text={CONTROL_TOOLTIPS.sporeColorSecondary || 'Secondary color for gradient effect'}>
                    <label className="text-sm font-medium text-gray-700 cursor-help flex items-center gap-1 mb-2">
                      Secondary Color (Gradient)
                      <span className="text-gray-400 text-xs">ⓘ</span>
                    </label>
                  </Tooltip>
                  <div className="flex gap-2 items-center">
                    <PalettePicker 
                      value={config.sporeColorSecondary ?? '#666666'} 
                      onChange={(c) => updateConfig({ sporeColorSecondary: c })} 
                    />
                    <button
                      onClick={() => updateConfig({ sporeColorSecondary: undefined })}
                      className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 border rounded"
                    >
                      Clear
                    </button>
                    {config.sporeColorSecondary && (
                      <span className="text-xs text-green-600">✓ Active</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    When set, spores blend from primary (center) to secondary (edge)
                  </p>
                </div>
                
                <SliderControl
                  label="Cloud Opacity"
                  tooltipKey="sporeCloudOpacity"
                  value={config.sporeCloudOpacity ?? 1.0}
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  onChange={(v) => updateConfig({ sporeCloudOpacity: v })}
                  format={(v) => `${(v * 100).toFixed(0)}%`}
                />
              </CollapsibleSection>
              
              {/* Module Masking (module-masked, material-unified) */}
              {enabledControls.edgeBufferFactor && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold mb-2">Module Masking</h3>
                  
                  <SliderControl
                    label="Edge Buffer"
                    tooltipKey="edgeBufferFactor"
                    value={config.edgeBufferFactor ?? 0.12}
                    min={0}
                    max={0.3}
                    step={0.02}
                    onChange={(v) => updateConfig({ edgeBufferFactor: v })}
                    format={(v) => `${(v * 100).toFixed(0)}%`}
                  />
                  
                  <SliderControl
                    label="Light Module Density"
                    tooltipKey="lightModuleDensity"
                    value={config.lightModuleDensity ?? 0.10}
                    min={0}
                    max={0.3}
                    step={0.02}
                    onChange={(v) => updateConfig({ lightModuleDensity: v })}
                    format={(v) => `${(v * 100).toFixed(0)}%`}
                  />
                  
                  <SliderControl
                    label="Light Module Max Opacity"
                    tooltipKey="lightModuleMaxOpacity"
                    value={config.lightModuleMaxOpacity ?? 0.18}
                    min={0}
                    max={0.4}
                    step={0.02}
                    onChange={(v) => updateConfig({ lightModuleMaxOpacity: v })}
                  />
                </div>
              )}
              
              {/* Particle Sizing (material-unified only) */}
              {enabledControls.sporeRadiusMinFactor && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold mb-2">Particle Sizing</h3>
                  
                  <SliderControl
                    label="Min Spore Radius"
                    tooltipKey="sporeRadiusMinFactor"
                    value={config.sporeRadiusMinFactor ?? 0.55}
                    min={0.3}
                    max={0.8}
                    step={0.05}
                    onChange={(v) => updateConfig({ sporeRadiusMinFactor: v })}
                    format={(v) => `${(v * 100).toFixed(0)}%`}
                  />
                  
                  <SliderControl
                    label="Max Spore Radius"
                    tooltipKey="sporeRadiusMaxFactor"
                    value={config.sporeRadiusMaxFactor ?? 0.85}
                    min={0.5}
                    max={1.2}
                    step={0.05}
                    onChange={(v) => updateConfig({ sporeRadiusMaxFactor: v })}
                    format={(v) => `${(v * 100).toFixed(0)}%`}
                  />
                </div>
              )}
              
              {/* Contrast Boost */}
              {enabledControls.moduleContrastBoost && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold mb-2">QR Contrast</h3>
                  
                  <SliderControl
                    label="Module Contrast Boost"
                    tooltipKey="moduleContrastBoost"
                    value={config.moduleContrastBoost ?? 1.0}
                    min={1.0}
                    max={1.5}
                    step={0.05}
                    onChange={(v) => updateConfig({ moduleContrastBoost: v })}
                    format={(v) => `${(v * 100).toFixed(0)}%`}
                  />
                </div>
              )}
              
              {/* Base Layer Controls - Collapsible */}
              <CollapsibleSection title="Base Layer" defaultOpen={false}>
                <ColorControl
                  label="Outer Ring"
                  tooltipKey="baseLayerConfig.outerRing.color"
                  color={config.baseLayerConfig.outerRing.color}
                  opacity={config.baseLayerConfig.outerRing.opacity}
                  onColorChange={(c) => updateBaseLayer('outerRing', 'color', c)}
                  onOpacityChange={(o) => updateBaseLayer('outerRing', 'opacity', o)}
                />
                
                <ColorControl
                  label="Text Ring"
                  tooltipKey="baseLayerConfig.textRing.color"
                  color={config.baseLayerConfig.textRing.color}
                  opacity={config.baseLayerConfig.textRing.opacity}
                  onColorChange={(c) => updateBaseLayer('textRing', 'color', c)}
                  onOpacityChange={(o) => updateBaseLayer('textRing', 'opacity', o)}
                />
                
                <ColorControl
                  label="Text"
                  tooltipKey="baseLayerConfig.text.color"
                  color={config.baseLayerConfig.text.color}
                  opacity={config.baseLayerConfig.text.opacity}
                  onColorChange={(c) => updateBaseLayer('text', 'color', c)}
                  onOpacityChange={(o) => updateBaseLayer('text', 'opacity', o)}
                />
                
                {/* Text Border Controls */}
                <div className="mb-4 pl-4 border-l-2 border-gray-200">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm font-medium text-gray-600">Text Border</label>
                    <span className="text-sm text-gray-500">
                      {config.baseLayerConfig.text.strokeWidth === 0 
                        ? 'None' 
                        : `${config.baseLayerConfig.text.strokeWidth.toFixed(1)}px`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.1}
                    value={config.baseLayerConfig.text.strokeWidth}
                    onChange={(e) => updateBaseLayer('text', 'strokeWidth', parseFloat(e.target.value))}
                    className="w-full"
                  />
                  {config.baseLayerConfig.text.strokeWidth > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <label className="text-xs text-gray-500">Border Color:</label>
                      <PalettePicker
                        value={config.baseLayerConfig.text.strokeColor}
                        onChange={(c) => updateBaseLayer('text', 'strokeColor', c)}
                      />
                    </div>
                  )}
                </div>
                
                <ColorControl
                  label="Radar Lines"
                  tooltipKey="baseLayerConfig.radarLines.color"
                  color={config.baseLayerConfig.radarLines.color}
                  opacity={config.baseLayerConfig.radarLines.opacity}
                  onColorChange={(c) => updateBaseLayer('radarLines', 'color', c)}
                  onOpacityChange={(o) => updateBaseLayer('radarLines', 'opacity', o)}
                />
                
                {/* Radar Lines Stroke Width */}
                <div className="mb-4 pl-4 border-l-2 border-gray-200">
                  <div className="flex justify-between items-center mb-1">
                    <Tooltip text={CONTROL_TOOLTIPS['baseLayerConfig.radarLines.strokeWidth'] || 'Line thickness multiplier'}>
                      <label className="text-sm font-medium text-gray-600 cursor-help flex items-center gap-1">
                        Line Thickness
                        <span className="text-gray-400 text-xs">ⓘ</span>
                      </label>
                    </Tooltip>
                    <span className="text-sm text-gray-500">
                      {((config.baseLayerConfig.radarLines.strokeWidth ?? 1.0) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={config.baseLayerConfig.radarLines.strokeWidth ?? 1.0}
                    onChange={(e) => updateBaseLayer('radarLines', 'strokeWidth', parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
                
                {/* Radar Lines Above QR Toggle */}
                <div className="mb-4 pl-4 border-l-2 border-gray-200">
                  <Tooltip text={CONTROL_TOOLTIPS['baseLayerConfig.radarLines.aboveQr'] || 'Render radar lines above the QR code'}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.baseLayerConfig.radarLines.aboveQr ?? false}
                        onChange={(e) => updateBaseLayer('radarLines', 'aboveQr', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-600">Render Above QR</span>
                      <span className="text-gray-400 text-xs">ⓘ</span>
                    </label>
                  </Tooltip>
                </div>
              </CollapsibleSection>
              
              {/* Export Calibration PDF */}
              <div className="mb-6 p-4 bg-green-50 rounded border border-green-200">
                <h3 className="text-sm font-semibold mb-2 text-green-800">Export Calibration PDF</h3>
                <p className="text-xs text-green-600 mb-3">
                  Export print-ready PDF with multiple sizes for testing scan reliability.
                </p>
                
                <div className="mb-3">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Sizes to include:</label>
                  <div className="flex flex-wrap gap-2">
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5].map(size => (
                      <label key={size} className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={exportSizes.includes(size)}
                          onChange={() => toggleExportSize(size)}
                          className="rounded"
                        />
                        {size}&quot;
                      </label>
                    ))}
                  </div>
                </div>
                
                <div className="mb-3">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Paper size:</label>
                  <select
                    value={exportPaper}
                    onChange={(e) => setExportPaper(e.target.value as 'letter' | 'a4')}
                    className="w-full px-2 py-1 border rounded text-sm"
                  >
                    <option value="letter">US Letter (8.5&quot; × 11&quot;)</option>
                    <option value="a4">A4 (210mm × 297mm)</option>
                  </select>
                </div>
                
                <button
                  onClick={handleExportPdf}
                  disabled={isExporting || exportSizes.length === 0}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-green-700"
                >
                  {isExporting ? 'Exporting...' : `Export PDF (${exportSizes.length} size${exportSizes.length !== 1 ? 's' : ''})`}
                </button>
              </div>
              
              {/* Save Preset */}
              <div className="mb-6 p-4 bg-gray-50 rounded">
                <h3 className="text-sm font-semibold mb-2">Save as Preset</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    placeholder="Preset name..."
                    className="flex-1 px-3 py-2 border rounded text-sm"
                  />
                  <button
                    onClick={handleSavePreset}
                    disabled={isSaving || !presetName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
          <div className="text-xs text-gray-500">
            Token: TUNER_PREVIEW_001 (test only)
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

