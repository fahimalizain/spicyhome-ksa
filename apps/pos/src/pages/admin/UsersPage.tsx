import { useState, useEffect } from 'react';
import { client } from '../../api';
import { Dialog } from '../../components/Dialog';
import type { UserResponse, RoleResponse, UpdateUserDto } from '@spicyhome/client-ts';

export function UsersPage() {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [roles, setRoles] = useState<RoleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    username: '',
    name: '',
    pin: '',
    roleId: 0,
    androidLogin: true,
  });
  const [saveError, setSaveError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

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
    setForm({ username: '', name: '', pin: '', roleId: roles[0]?.id || 0, androidLogin: true });
    setEditId(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(u: UserResponse) {
    setForm({
      username: u.username,
      name: u.name,
      pin: '',
      roleId: u.roleId,
      androidLogin: u.androidLogin ?? true,
    });
    setEditId(u.id);
    setDialogOpen(true);
  }

  /** Cancel, backdrop, and Escape all land here. Always resets the form. */
  function closeDialog() {
    setDialogOpen(false);
    resetForm();
    setSaveError('');
  }

  async function handleSave() {
    if (submitting) return;
    setSaveError('');
    setSubmitting(true);
    try {
      if (editId) {
        const updateData: UpdateUserDto = {
          name: form.name,
          roleId: form.roleId,
          androidLogin: form.androidLogin,
        };
        if (form.pin) updateData.pin = form.pin;
        await client.auth.updateUser(editId, updateData);
      } else {
        await client.auth.createUser({ ...form, pin: form.pin || '0000' });
      }
      closeDialog();
      await loadData();
    } catch (e: any) {
      setSaveError(e.message || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-4 text-gray-400">Loading...</div>;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">Users</h1>
        <button
          type="button"
          onClick={openCreate}
          className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white"
        >
          New User
        </button>
      </div>

      {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

      <div className="space-y-1">
        {users.map((u) => (
          <div
            key={u.id}
            onClick={() => openEdit(u)}
            className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-700/50"
          >
            <div>
              <span className="text-sm text-white">{u.name}</span>
              <span className="text-xs text-gray-500 ml-2">@{u.username}</span>
              {u.androidLogin === false && (
                <span className="text-xs text-gray-500 ml-2">(no Android)</span>
              )}
            </div>
            <span className="touch-target text-xs text-brand-400 px-2 py-1 pointer-events-none">
              Edit
            </span>
          </div>
        ))}
      </div>

      {dialogOpen && (
        <Dialog
          title={editId ? 'Edit User' : 'New User'}
          onClose={closeDialog}
          footer={
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeDialog}
                disabled={submitting}
                className="touch-target bg-gray-700 hover:bg-gray-600 rounded px-4 py-2 text-sm text-gray-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={submitting}
                className="touch-target bg-brand-600 hover:bg-brand-700 rounded px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
            </div>
          }
        >
          {saveError && <div className="text-red-400 text-sm mb-3">{saveError}</div>}
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="user-username">
                Username
              </label>
              <input
                id="user-username"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                required
                disabled={!!editId}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="user-name">
                Name
              </label>
              <input
                id="user-name"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="user-pin">
                PIN {editId ? '(leave blank to keep)' : ''}
              </label>
              <input
                id="user-pin"
                type="password"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.pin}
                onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))}
                required={!editId}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1" htmlFor="user-role">
                Role
              </label>
              <select
                id="user-role"
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                value={form.roleId}
                onChange={(e) => setForm((f) => ({ ...f, roleId: Number(e.target.value) }))}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="user-android-login"
                type="checkbox"
                checked={form.androidLogin}
                onChange={(e) => setForm((f) => ({ ...f, androidLogin: e.target.checked }))}
                className="w-4 h-4 accent-brand-600"
              />
              <label htmlFor="user-android-login" className="text-sm text-white cursor-pointer">
                Show on Android login
              </label>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
