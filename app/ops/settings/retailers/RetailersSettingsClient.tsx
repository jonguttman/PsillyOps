'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Store,
  Search,
  Check,
  X,
  Loader2,
  ShoppingBag,
  Mail,
  Phone,
  MapPin,
  User,
  FileText,
  AlertTriangle,
  Eye,
  EyeOff,
} from 'lucide-react';

interface SalesRep {
  id: string;
  name: string | null;
  email: string | null;
  role?: string;
}

interface Retailer {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  shippingAddress: string | null;
  billingAddress: string | null;
  notes: string | null;
  salesRepId: string | null;
  salesRep: SalesRep | null;
  active: boolean;
  ordersCount: number;
  invoicesCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  retailers: Retailer[];
  salesReps: SalesRep[];
}

export default function RetailersSettingsClient({ retailers: initialRetailers, salesReps }: Props) {
  const router = useRouter();
  const [retailers, setRetailers] = useState(initialRetailers);
  const [showModal, setShowModal] = useState(false);
  const [editingRetailer, setEditingRetailer] = useState<Retailer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  
  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingRetailer, setDeletingRetailer] = useState<Retailer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    contactEmail: '',
    contactPhone: '',
    shippingAddress: '',
    billingAddress: '',
    notes: '',
    salesRepId: '',
  });

  // Filter retailers
  const filteredRetailers = retailers.filter(r => {
    const matchesSearch = searchQuery === '' || 
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.contactEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.salesRep?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesActive = showInactive ? true : r.active;
    
    return matchesSearch && matchesActive;
  });

  // Stats
  const activeCount = retailers.filter(r => r.active).length;
  const inactiveCount = retailers.filter(r => !r.active).length;
  const totalOrders = retailers.reduce((sum, r) => sum + r.ordersCount, 0);

  const resetForm = () => {
    setFormData({
      name: '',
      contactEmail: '',
      contactPhone: '',
      shippingAddress: '',
      billingAddress: '',
      notes: '',
      salesRepId: '',
    });
    setError(null);
  };

  const openCreateModal = () => {
    resetForm();
    setEditingRetailer(null);
    setShowModal(true);
  };

  const openEditModal = (retailer: Retailer) => {
    setFormData({
      name: retailer.name,
      contactEmail: retailer.contactEmail || '',
      contactPhone: retailer.contactPhone || '',
      shippingAddress: retailer.shippingAddress || '',
      billingAddress: retailer.billingAddress || '',
      notes: retailer.notes || '',
      salesRepId: retailer.salesRepId || '',
    });
    setEditingRetailer(retailer);
    setError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingRetailer(null);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const url = editingRetailer 
        ? `/api/retailers/${editingRetailer.id}` 
        : '/api/retailers';
      
      const method = editingRetailer ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          contactEmail: formData.contactEmail.trim() || null,
          contactPhone: formData.contactPhone.trim() || null,
          shippingAddress: formData.shippingAddress.trim() || null,
          billingAddress: formData.billingAddress.trim() || null,
          notes: formData.notes.trim() || null,
          salesRepId: formData.salesRepId || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save retailer');
      }

      closeModal();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!deletingRetailer) return;
    
    setIsDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/retailers/${deletingRetailer.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to archive retailer');
      }

      setShowDeleteConfirm(false);
      setDeletingRetailer(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReactivate = async (retailer: Retailer) => {
    try {
      const res = await fetch(`/api/retailers/${retailer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reactivate retailer');
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/ops/settings"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Retailers</h1>
          <p className="text-sm text-gray-600">
            Manage your wholesale customers and retailers
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Retailer
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm text-gray-500">Active Retailers</div>
          <div className="text-2xl font-semibold text-gray-900">{activeCount}</div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm text-gray-500">Inactive</div>
          <div className="text-2xl font-semibold text-gray-900">{inactiveCount}</div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm text-gray-500">Total Orders</div>
          <div className="text-2xl font-semibold text-gray-900">{totalOrders}</div>
        </div>
        <div className="bg-white shadow rounded-lg p-4">
          <div className="text-sm text-gray-500">Sales Reps</div>
          <div className="text-2xl font-semibold text-gray-900">{salesReps.length}</div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search retailers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            showInactive 
              ? 'bg-gray-100 border-gray-300 text-gray-700' 
              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {showInactive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {showInactive ? 'Showing Inactive' : 'Show Inactive'}
        </button>
      </div>

      {/* Retailers table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Retailer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sales Rep
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Orders
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredRetailers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  {searchQuery || showInactive ? (
                    'No retailers match your search.'
                  ) : (
                    <>
                      No retailers found.{' '}
                      <button
                        onClick={openCreateModal}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Add your first retailer
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              filteredRetailers.map((retailer) => (
                <tr key={retailer.id} className={`hover:bg-gray-50 ${!retailer.active ? 'bg-gray-50 opacity-75' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-100 rounded-lg">
                        <Store className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {retailer.name}
                        </div>
                        {retailer.shippingAddress && (
                          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" />
                            {retailer.shippingAddress.split('\n')[0]}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      {retailer.contactEmail ? (
                        <a
                          href={`mailto:${retailer.contactEmail}`}
                          className="text-sm text-blue-600 hover:text-blue-900 flex items-center gap-1"
                        >
                          <Mail className="w-3 h-3" />
                          {retailer.contactEmail}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400">No email</span>
                      )}
                      {retailer.contactPhone && (
                        <div className="text-sm text-gray-600 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {retailer.contactPhone}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {retailer.salesRep ? (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-900">
                          {retailer.salesRep.name || retailer.salesRep.email}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-900">
                        {retailer.ordersCount}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {retailer.active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <Check className="w-3 h-3" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        <X className="w-3 h-3" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(retailer)}
                        className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {retailer.active ? (
                        <button
                          onClick={() => {
                            setDeletingRetailer(retailer);
                            setShowDeleteConfirm(true);
                          }}
                          className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Archive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(retailer)}
                          className="p-1.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                          title="Reactivate"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
              onClick={closeModal}
            />

            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-auto z-10">
              <form onSubmit={handleSubmit}>
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {editingRetailer ? 'Edit Retailer' : 'Add New Retailer'}
                  </h3>
                </div>

                <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                      {error}
                    </div>
                  )}

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Retailer Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Green Leaf Dispensary"
                      required
                    />
                  </div>

                  {/* Contact Info Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={formData.contactEmail}
                        onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="orders@retailer.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={formData.contactPhone}
                        onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>

                  {/* Sales Rep */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sales Representative
                    </label>
                    <select
                      value={formData.salesRepId}
                      onChange={(e) => setFormData({ ...formData, salesRepId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">No sales rep assigned</option>
                      {salesReps.map((rep) => (
                        <option key={rep.id} value={rep.id}>
                          {rep.name || rep.email} {rep.role === 'ADMIN' ? '(Admin)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Shipping Address */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Shipping Address
                    </label>
                    <textarea
                      value={formData.shippingAddress}
                      onChange={(e) => setFormData({ ...formData, shippingAddress: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      rows={3}
                      placeholder="123 Main St&#10;Suite 100&#10;City, State 12345"
                    />
                  </div>

                  {/* Billing Address */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Billing Address
                    </label>
                    <textarea
                      value={formData.billingAddress}
                      onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      rows={3}
                      placeholder="Same as shipping, or enter different address"
                    />
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      rows={2}
                      placeholder="Internal notes about this retailer..."
                    />
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !formData.name.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editingRetailer ? 'Save Changes' : 'Create Retailer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deletingRetailer && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div 
              className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeletingRetailer(null);
              }}
            />

            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-auto z-10 p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Archive Retailer
                  </h3>
                  <p className="text-sm text-gray-500">
                    This action can be undone later.
                  </p>
                </div>
              </div>

              <p className="text-gray-600 mb-6 text-left">
                Are you sure you want to archive <strong>{deletingRetailer.name}</strong>? 
                They will no longer appear in the active retailers list.
              </p>

              {deletingRetailer.ordersCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-left">
                  <p className="text-sm text-amber-800">
                    <strong>Note:</strong> This retailer has {deletingRetailer.ordersCount} order(s). 
                    Historical orders will be preserved.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletingRetailer(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleArchive}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Archive Retailer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

