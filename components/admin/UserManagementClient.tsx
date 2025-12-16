'use client';

import { useState } from 'react';
import { UserPlus, Shield, ShieldOff, Key, RefreshCw } from 'lucide-react';
import CreateUserModal from './CreateUserModal';
import ResetPasswordModal from './ResetPasswordModal';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Props {
  initialUsers: User[];
  currentUserId: string;
}

export default function UserManagementClient({ initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update role');
      }

      const { user: updatedUser } = await res.json();
      setUsers(users.map(u => u.id === userId ? { ...u, ...updatedUser } : u));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update role');
    } finally {
      setLoading(null);
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    const action = currentActive ? 'deactivate' : 'reactivate';
    if (!confirm(`Are you sure you want to ${action} this user?`)) {
      return;
    }

    setLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || `Failed to ${action} user`);
      }

      const { user: updatedUser } = await res.json();
      setUsers(users.map(u => u.id === userId ? { ...u, ...updatedUser } : u));
    } catch (error) {
      alert(error instanceof Error ? error.message : `Failed to ${action} user`);
    } finally {
      setLoading(null);
    }
  };

  const handleResetPassword = (user: User) => {
    setSelectedUser(user);
    setShowResetPasswordModal(true);
  };

  return (
    <div>
      {/* Action Bar */}
      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {users.length} total users • {users.filter(u => u.active).length} active
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Create User
        </button>
      </div>

      {/* User Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Login
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className={!user.active ? 'bg-gray-50 opacity-60' : ''}>
                <td className="px-6 py-4">
                  <div>
                    <div className="font-medium text-gray-900">
                      {user.name}
                      {user.id === currentUserId && (
                        <span className="ml-2 text-xs text-blue-600">(You)</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {user.id === currentUserId ? (
                    <span className="text-sm font-medium text-gray-900">{user.role}</span>
                  ) : (
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      disabled={loading === user.id}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="PRODUCTION">PRODUCTION</option>
                      <option value="WAREHOUSE">WAREHOUSE</option>
                      <option value="REP">REP</option>
                    </select>
                  )}
                </td>
                <td className="px-6 py-4">
                  {user.id === currentUserId ? (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      user.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {user.active ? 'Active' : 'Inactive'}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleToggleActive(user.id, user.active)}
                      disabled={loading === user.id}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                        user.active 
                          ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                          : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      }`}
                    >
                      {user.active ? <Shield className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                      {user.active ? 'Active' : 'Inactive'}
                    </button>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleResetPassword(user)}
                    disabled={loading === user.id}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    <Key className="w-4 h-4" />
                    Reset Password
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No users found. Create your first user to get started.
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onUserCreated={(user) => {
            setUsers([user, ...users]);
            setShowCreateModal(false);
          }}
        />
      )}

      {showResetPasswordModal && selectedUser && (
        <ResetPasswordModal
          user={selectedUser}
          onClose={() => {
            setShowResetPasswordModal(false);
            setSelectedUser(null);
          }}
          onPasswordReset={() => {
            setShowResetPasswordModal(false);
            setSelectedUser(null);
          }}
        />
      )}
    </div>
  );
}

