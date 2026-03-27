'use client';

import { useEffect, useState } from 'react';
import { type AdminUser, listUsers, updateUser } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export default function UsersPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingUserId, setWorkingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    listUsers()
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  async function patchUser(userId: string, body: { role?: 'admin' | 'user'; enabled?: boolean }) {
    setWorkingUserId(userId);
    setError(null);
    try {
      const updated = await updateUser(userId, body);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setWorkingUserId(null);
    }
  }

  if (!isAdmin) {
    return <p className="text-sm text-gray-500">Admin access required.</p>;
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading users…</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Users</h1>

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => {
              const isWorking = workingUserId === user.id;
              return (
                <tr key={user.id}>
                  <td className="px-4 py-3 text-gray-900">{user.email}</td>
                  <td className="px-4 py-3 text-gray-600">{new Date(user.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.is_admin ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      {user.is_admin ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.is_enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {user.is_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={isWorking}
                        onClick={() => patchUser(user.id, { role: user.is_admin ? 'user' : 'admin' })}
                        className="rounded border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                      >
                        {user.is_admin ? 'Make user' : 'Make admin'}
                      </button>
                      <button
                        disabled={isWorking}
                        onClick={() => patchUser(user.id, { enabled: !user.is_enabled })}
                        className="rounded border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                      >
                        {user.is_enabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
