'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Phone, Building2, User, ChevronDown, ChevronUp } from 'lucide-react';
import { InquiryStatus } from '@prisma/client';

interface Inquiry {
  id: string;
  contactName: string;
  businessName: string;
  email: string;
  phone: string | null;
  followUpWith: string | null;
  message: string | null;
  productsOfInterest: any;
  status: InquiryStatus;
  notes: string | null;
  createdAt: Date;
  catalogLink: {
    id: string;
    token: string;
    retailer: { name: string };
  };
}

interface InquiriesClientProps {
  inquiries: Inquiry[];
}

export function InquiriesClient({ inquiries }: InquiriesClientProps) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<InquiryStatus | 'ALL'>('ALL');

  const filteredInquiries = filter === 'ALL'
    ? inquiries
    : inquiries.filter(i => i.status === filter);

  const handleStatusChange = async (id: string, newStatus: InquiryStatus) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/ops/catalog-links/inquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (res.ok) {
        router.refresh();
      } else {
        alert('Failed to update status');
      }
    } catch (error) {
      alert('Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const statusBadge = {
    NEW: 'bg-orange-100 text-orange-800',
    CONTACTED: 'bg-blue-100 text-blue-800',
    CONVERTED: 'bg-green-100 text-green-800',
    CLOSED: 'bg-gray-100 text-gray-800'
  };

  return (
    <div>
      {/* Filter */}
      <div className="mb-4">
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as InquiryStatus | 'ALL')}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="ALL">All Inquiries</option>
          <option value="NEW">New Only</option>
          <option value="CONTACTED">Contacted</option>
          <option value="CONVERTED">Converted</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {/* Inquiries list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filteredInquiries.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {filteredInquiries.map(inquiry => (
              <div key={inquiry.id} className="p-4">
                {/* Header row */}
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedId(expandedId === inquiry.id ? null : inquiry.id)}
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900">{inquiry.contactName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Building2 className="w-4 h-4" />
                        {inquiry.businessName}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">
                      via {inquiry.catalogLink.retailer.name}
                    </span>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusBadge[inquiry.status]}`}>
                      {inquiry.status}
                    </span>
                    <span className="text-sm text-gray-400">
                      {new Date(inquiry.createdAt).toLocaleDateString()}
                    </span>
                    {expandedId === inquiry.id ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {expandedId === inquiry.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* Contact info */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-4 h-4 text-gray-400" />
                          <a
                            href={`mailto:${inquiry.email}`}
                            className="text-indigo-600 hover:underline"
                          >
                            {inquiry.email}
                          </a>
                        </div>
                        {inquiry.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="w-4 h-4 text-gray-400" />
                            <a
                              href={`tel:${inquiry.phone}`}
                              className="text-indigo-600 hover:underline"
                            >
                              {inquiry.phone}
                            </a>
                          </div>
                        )}
                        {inquiry.followUpWith && (
                          <div className="text-sm">
                            <span className="text-gray-500">Follow up with:</span>{' '}
                            <span className="text-gray-900">{inquiry.followUpWith}</span>
                          </div>
                        )}
                      </div>

                      {/* Message */}
                      <div>
                        {inquiry.message && (
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Message</p>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              {inquiry.message}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status update */}
                    <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-4">
                      <span className="text-sm text-gray-500">Update status:</span>
                      <div className="flex gap-2">
                        {(['NEW', 'CONTACTED', 'CONVERTED', 'CLOSED'] as InquiryStatus[]).map(status => (
                          <button
                            key={status}
                            onClick={() => handleStatusChange(inquiry.id, status)}
                            disabled={updatingId === inquiry.id || inquiry.status === status}
                            className={`text-xs px-3 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                              inquiry.status === status
                                ? statusBadge[status]
                                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500">
            No inquiries found
          </div>
        )}
      </div>
    </div>
  );
}
