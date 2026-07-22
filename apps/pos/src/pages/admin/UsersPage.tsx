import { useState, useEffect } from 'react';
import { client } from '../../api';
import type { UserResponse, RoleResponse } from '@spicyhome/client-ts';

export function UsersPage() {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ username: '', name: '', pin: '', roleId: 0 });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [userList, roleList] = await Promise.all([
        client.auth.listUsers(),
        client.auth.listRoles(),
      ]);
      setUsers(userList);
      setRoles(roleList);
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm({ username: '', name: '', pin: '', roleId: roles[0]?.id || 0 });
    setEditId(null);
  }

  function editUser(u: UserResponse) {
    setForm({ username: u.username, name: u.name, pin: '', roleId: u.roleId });
    setEditId(u.id);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      if (editId) {
        const updateData: any = { name: form.name, roleId: form.roleId };
        if (form.pin) updateData.pin = form.pin;
        await client.auth.updateUser(editId, updateData);
      } else {
        await client.auth.createUser({ ...form, pin: form.pin || '0000' });
      }
      resetForm();
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    }
  }

  if (loading) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto p-4">
      <h1 className="text-xl font-bold text-white mb-4">Users</h1>
      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      <form onSubmit={handleSave} className="bg-gray-800 rounded-xl p-4 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300">{editId ? 'Edit User' : 'New User'}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Username</label>
            <input className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required disabled={!!editId} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">PIN {editId ? '(leave blank to keep)' : ''}</label>
            <input type="password" className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white" value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))} required={!editId} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Role</label>
            <select className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white" value={form.roleId} onChange={(e) => setForm((f) => ({ ...f, roleId: Number(e.target.value) }))}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white">
            {editId ? 'Update' : 'Create'}
          </button>
          {editId && (
            <button type="button" onClick={resetForm} className="touch-target bg-gray-700 hover:bg-gray-600 rounded px-4 py-2 text-sm text-gray-300">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="space-y-1">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
            <div>
              <span className="text-sm text-white">{u.name}</span>
              <span className="text-xs text-gray-500 ml-2">@{u.username}</span>
            </div>
            <button onClick={() => editUser(u)} className="touch-target text-xs text-brand-400 hover:text-brand-300 px-2 py-1">Edit</button>
          </div>
        ))}
      </div>
    </div>
  );
}
