'use client';

import { useState } from 'react';
import { Download, FileText, FileJson } from 'lucide-react';

export function ExportClient() {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [productId, setProductId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [flagged, setFlagged] = useState<string>('');
  const [loading, setLoading] = useState(false);
  
  const handleExport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        format
      });
      if (productId) params.append('productId', productId);
      if (batchId) params.append('batchId', batchId);
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);
      if (flagged) params.append('flagged', flagged);
      
      const response = await fetch(`/api/insights/tripdar/export?${params}`);
      if (!response.ok) {
        throw new Error('Export failed');
      }
      
      // Download file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tripdar-export-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Export Reviews</h1>
        <p className="text-sm text-gray-600">Export experience reviews for ML analysis</p>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
        {/* Format Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Export Format
          </label>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setFormat('csv')}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                format === 'csv'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              <FileText className="w-5 h-5" />
              CSV
            </button>
            <button
              type="button"
              onClick={() => setFormat('json')}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                format === 'json'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              <FileJson className="w-5 h-5" />
              JSON
            </button>
          </div>
        </div>
        
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product ID (optional)
            </label>
            <input
              type="text"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Filter by product..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Batch ID (optional)
            </label>
            <input
              type="text"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Filter by batch..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              From Date (optional)
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              To Date (optional)
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Integrity Status (optional)
            </label>
            <select
              value={flagged}
              onChange={(e) => setFlagged(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All</option>
              <option value="true">Flagged only</option>
              <option value="false">Clean only</option>
            </select>
          </div>
        </div>
        
        {/* Export Button */}
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={handleExport}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-5 h-5" />
            {loading ? 'Exporting...' : 'Export Data'}
          </button>
        </div>
      </div>
    </div>
  );
}

