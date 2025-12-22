'use client';

import { useEffect, useState } from 'react';
import { ReviewStats } from '@/lib/services/experienceService';
import { TrendingUp, Target, CheckCircle, XCircle, BarChart3, AlertTriangle } from 'lucide-react';

interface TripDARDashboardClientProps {
  initialStats: ReviewStats;
}

export function TripDARDashboardClient({ initialStats }: TripDARDashboardClientProps) {
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);
  
  const refreshStats = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/insights/tripdar/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to refresh stats:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const goalProgress = stats.goalProgress.current / stats.goalProgress.target;
  const goalPercent = Math.min(goalProgress * 100, 100);
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">TripDAR Insights</h1>
          <p className="text-sm text-gray-600">Experience data collection and analysis</p>
        </div>
        <button
          onClick={refreshStats}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      
      {/* Goal Progress */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Target className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Review Goal</h2>
          </div>
          <span className="text-2xl font-bold text-gray-900">
            {stats.goalProgress.current} / {stats.goalProgress.target}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className="bg-blue-600 h-4 rounded-full transition-all duration-300"
            style={{ width: `${goalPercent}%` }}
          />
        </div>
        <p className="text-sm text-gray-600 mt-2">
          {goalPercent.toFixed(1)}% complete
        </p>
      </div>
      
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={TrendingUp}
          label="Total Reviews"
          value={stats.total.toLocaleString()}
          color="blue"
        />
        <MetricCard
          icon={BarChart3}
          label="Weekly Submissions"
          value={stats.weeklySubmissions.toLocaleString()}
          color="green"
        />
        <MetricCard
          icon={CheckCircle}
          label="Completion Rate"
          value={`${(stats.completionRate * 100).toFixed(1)}%`}
          color="purple"
        />
        <MetricCard
          icon={XCircle}
          label="Skip Rate"
          value={`${(stats.skipRate * 100).toFixed(1)}%`}
          color="orange"
        />
      </div>
      
      {/* Experience Mode Breakdown */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">By Experience Mode</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">MICRO</div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.byMode.MICRO.total.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.byMode.MICRO.weeklySubmissions} this week
            </div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">MACRO</div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.byMode.MACRO.total.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.byMode.MACRO.weeklySubmissions} this week
            </div>
          </div>
        </div>
      </div>
      
      {/* Data Quality Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Neutral Response Rate</h3>
          <div className="text-3xl font-bold text-gray-900">
            {(stats.neutralRate * 100).toFixed(1)}%
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Reviews with neutral/no-change responses
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Integrity Breakdown</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Clean</span>
              <span className="font-semibold text-green-600">
                {stats.integrityBreakdown.clean.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Flagged</span>
              <span className="font-semibold text-amber-600">
                {stats.integrityBreakdown.flagged.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="flex gap-3">
          <a
            href="/ops/insights/tripdar/reviews"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Browse Reviews
          </a>
          <a
            href="/ops/insights/tripdar/export"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Export Data
          </a>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ 
  icon: Icon, 
  label, 
  value, 
  color 
}: { 
  icon: any; 
  label: string; 
  value: string; 
  color: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600'
  };
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm font-medium text-gray-600">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

