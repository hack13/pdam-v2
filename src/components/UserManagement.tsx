import { useState, useEffect } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { formatBytes } from '../lib/format-bytes';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  assetCount: number;
  logicalBytesUsed: number;
}

interface UserManagementProps {
  currentUserId: string;
  initialUsers?: AdminUser[];
}

export function UserManagement({ currentUserId, initialUsers = [] }: UserManagementProps) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [loading, setLoading] = useState(initialUsers.length === 0);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('user');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (initialUsers.length === 0) {
      fetchUsers();
    }
  }, []);

  async function fetchUsers() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load users');
      }
      const data = await res.json();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  function openEdit(user: AdminUser) {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditError('');
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    setEditLoading(true);
    setEditError('');

    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim(),
          role: editRole,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update user');
      }

      setEditingUser(null);
      await fetchUsers();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    if (!deletingUser) return;

    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${deletingUser.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      setDeletingUser(null);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
      setDeletingUser(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-400">Loading users...</p>;
  }

  if (error && users.length === 0) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="px-4 py-3 font-medium text-zinc-300">User</th>
              <th className="hidden px-4 py-3 font-medium text-zinc-300 md:table-cell">Role</th>
              <th className="px-4 py-3 font-medium text-zinc-300">Assets</th>
              <th className="hidden px-4 py-3 font-medium text-zinc-300 sm:table-cell">Storage</th>
              <th className="hidden px-4 py-3 font-medium text-zinc-300 lg:table-cell">Joined</th>
              <th className="px-4 py-3 text-right font-medium text-zinc-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-white">{user.name}</p>
                    <p className="text-xs text-zinc-500">{user.email}</p>
                  </div>
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      user.role === 'admin'
                        ? 'bg-indigo-500/20 text-indigo-300'
                        : user.role === 'creator'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-white/5 text-zinc-400'
                    }`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-300">{user.assetCount}</td>
                <td className="hidden px-4 py-3 text-zinc-300 sm:table-cell">
                  {formatBytes(user.logicalBytesUsed)}
                </td>
                <td className="hidden px-4 py-3 text-zinc-400 lg:table-cell">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(user)}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingUser(user)}
                      disabled={user.id === currentUserId}
                      title={user.id === currentUserId ? 'You cannot delete your own account' : undefined}
                      className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:border-red-500/30 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-zinc-500">No users found.</div>
        )}
      </div>

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white">Edit User</h3>
            <p className="mt-1 text-sm text-zinc-400">{editingUser.email}</p>

            <form onSubmit={handleEditSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="edit-name" className="mb-1 block text-sm text-zinc-400">
                  Name
                </label>
                <input
                  id="edit-name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  maxLength={100}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                />
              </div>

              <div>
                <label htmlFor="edit-email" className="mb-1 block text-sm text-zinc-400">
                  Email
                </label>
                <input
                  id="edit-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                />
              </div>

              <div>
                <label htmlFor="edit-role" className="mb-1 block text-sm text-zinc-400">
                  Role
                </label>
                <select
                  id="edit-role"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50"
                >
                  <option value="user">User</option>
                  <option value="creator">Creator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {editError && <p className="text-sm text-red-400">{editError}</p>}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  disabled={editLoading}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="btn-primary disabled:opacity-50"
                >
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingUser && (
        <ConfirmDialog
          title="Delete User"
          message={
            <>
              Are you sure you want to delete <strong className="text-white">{deletingUser.name}</strong>?
              This will permanently delete all of their assets and remove their files from storage when no other users reference them.
            </>
          }
          description={`${deletingUser.assetCount} asset(s) and ${formatBytes(deletingUser.logicalBytesUsed)} of logical storage will be affected.`}
          confirmLabel="Delete User"
          loading={deleteLoading}
          onClose={() => setDeletingUser(null)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
