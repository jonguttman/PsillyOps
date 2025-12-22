'use client';

import { useState, useEffect } from 'react';
import { Search, Filter, AlertTriangle } from 'lucide-react';

interface Review {
  id: string;
  product: { id: string; name: string; sku: string };
  batch: { id: string; batchCode: string } | null;
  experienceMode: string;
  overallMatch: number | null;
  completionRate: number;
  integrityFlags: any;
  contentFlags: any;
  createdAt: string;
}

export function ReviewsBrowserClient() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Filters
  const [productId, setProductId] = useState<string>('');
  const [batchId, setBatchId] = useState<string>('');
  const [experienceMode, setExperienceMode] = useState<string>('');
  const [flagged, setFlagged] = useState<string>('');
  
  const fetchReviews = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      });
      if (productId) params.append('productId', productId);
      if (batchId) params.append('batchId', batchId);
      if (experienceMode) params.append('experienceMode', experienceMode);
      if (flagged) params.append('flagged', flagged);
      
      const response = await fetch(`/api/insights/tripdar/reviews?${params}`);
      if (response.ok) {
        const data = await response.json();
        setReviews(data.reviews);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchReviews();
  }, [page, productId, batchId, experienceMode, flagged]);
  
  const hasIntegrityFlags = (review: Review) => {
    return review.integrityFlags && 
           review.integrityFlags.context && 
           review.integrityFlags.context.length > 0 &&
           review.integrityFlags.context[0] !== 'clean';
  };
  
  const hasContentFlags = (review: Review) => {
    return review.contentFlags && 
           (review.contentFlags.spam || review.contentFlags.profanity || review.contentFlags.hasUrl);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Browser</h1>
          <p className="text-sm text-gray-600">Browse and filter experience reviews</p>
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product ID
            </label>
            <input
              type="text"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Filter by product..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Batch ID
            </label>
            <input
              type="text"
              value={batchId}
              onChange={(e) => {
                setBatchId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Filter by batch..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Experience Mode
            </label>
            <select
              value={experienceMode}
              onChange={(e) => {
                setExperienceMode(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All</option>
              <option value="MICRO">MICRO</option>
              <option value="MACRO">MACRO</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Integrity Status
            </label>
            <select
              value={flagged}
              onChange={(e) => {
                setFlagged(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All</option>
              <option value="true">Flagged</option>
              <option value="false">Clean</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Reviews Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading reviews...</div>
        ) : reviews.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No reviews found</div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mode
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Overall Match
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Completion
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Flags
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {reviews.map((review) => (
                  <tr key={review.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {review.product.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {review.product.sku}
                        </div>
                        {review.batch && (
                          <div className="text-xs text-gray-400">
                            Batch: {review.batch.batchCode}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        review.experienceMode === 'MICRO' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-purple-100 text-purple-800'
                      }`}>
                        {review.experienceMode}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {review.overallMatch !== null ? (
                        <span className="text-sm text-gray-900">
                          {review.overallMatch} / 4
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">Skipped</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">
                        {(review.completionRate * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex gap-2">
                        {hasIntegrityFlags(review) && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Integrity
                          </span>
                        )}
                        {hasContentFlags(review) && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            Content
                          </span>
                        )}
                        {!hasIntegrityFlags(review) && !hasContentFlags(review) && (
                          <span className="text-xs text-gray-400">Clean</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(review.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-gray-50 px-6 py-4 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing page {page} of {totalPages} ({total} total)
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

