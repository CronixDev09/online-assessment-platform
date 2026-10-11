import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, apiError } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { EmptyState, ErrorText, Modal, PageHeader, Spinner, StatusBadge } from '../../components/ui';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  phone: string | null;
  organization: string | null;
  candidateCode: string | null;
  createdAt: string;
  _count?: { sessions: number; assignments: number };
}

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'CANDIDATE',
  phone: '',
  organization: '',
  candidateCode: '',
};

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState<User | null>(null);
  const [resetFor, setResetFor] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (roleFilter) params.set('role', roleFilter);
    api
      .get<{ users: User[] }>(`/admin/users?${params.toString()}`)
      .then((r) => setUsers(r.data.users))
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, [search, roleFilter]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/admin/users', form);
      setShowCreate(false);
      setForm({ ...emptyForm });
      load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      await api.put(`/admin/users/${editing.id}`, {
        name: editing.name,
        role: editing.role,
        status: editing.status,
        phone: editing.phone || null,
        organization: editing.organization || null,
        candidateCode: editing.candidateCode || null,
      });
      setEditing(null);
      load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const disable = async (user: User) => {
    if (!window.confirm(`Disable ${user.name}? Their records are preserved.`)) return;
    await api.delete(`/admin/users/${user.id}`);
    load();
  };

  const resetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetFor) return;
    setBusy(true);
    try {
      await api.post(`/admin/users/${resetFor.id}/reset-password`, { password: newPassword });
      setResetFor(null);
      setNewPassword('');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage administrators and candidates."
        actions={
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            Add user
          </button>
        }
      />
      <ErrorText>{error}</ErrorText>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input max-w-[180px]" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          <option value="ADMIN">Admins</option>
          <option value="CANDIDATE">Candidates</option>
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : users.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-slate-700">
                    <Link to={`/admin/users/${u.id}`} className="hover:text-indigo-600">
                      {u.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${u.role === 'ADMIN' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{u.organization ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2 text-xs">
                      <button className="text-indigo-600 hover:underline" onClick={() => setEditing({ ...u })}>
                        Edit
                      </button>
                      <button className="text-slate-600 hover:underline" onClick={() => setResetFor(u)}>
                        Reset password
                      </button>
                      {u.status === 'ACTIVE' ? (
                        <button className="text-rose-600 hover:underline" onClick={() => disable(u)}>
                          Disable
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create */}
      <Modal open={showCreate} title="Add user" onClose={() => setShowCreate(false)}>
        <form onSubmit={create} className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="CANDIDATE">Candidate</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div>
              <label className="label">Candidate code</label>
              <input className="input" value={form.candidateCode} onChange={(e) => setForm({ ...form, candidateCode: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Organization</label>
            <input className="input" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Creating...' : 'Create user'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit */}
      <Modal open={Boolean(editing)} title="Edit user" onClose={() => setEditing(null)}>
        {editing ? (
          <form onSubmit={saveEdit} className="space-y-3">
            <div>
              <label className="label">Name</label>
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Role</label>
                <select className="input" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                  <option value="CANDIDATE">Candidate</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                  <option value="ACTIVE">Active</option>
                  <option value="DISABLED">Disabled</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Phone</label>
                <input className="input" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </div>
              <div>
                <label className="label">Candidate code</label>
                <input className="input" value={editing.candidateCode ?? ''} onChange={(e) => setEditing({ ...editing, candidateCode: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label">Organization</label>
              <input className="input" value={editing.organization ?? ''} onChange={(e) => setEditing({ ...editing, organization: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy}>
                Save changes
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Reset password */}
      <Modal open={Boolean(resetFor)} title={`Reset password${resetFor ? ` - ${resetFor.name}` : ''}`} onClose={() => setResetFor(null)}>
        <form onSubmit={resetPassword} className="space-y-3">
          <div>
            <label className="label">New password</label>
            <input type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-secondary" onClick={() => setResetFor(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              Reset password
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
