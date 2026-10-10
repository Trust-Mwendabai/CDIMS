import { useEffect, useMemo, useState } from 'react';
import { Check, KeyRound, Minus, Search, UserPlus, X } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import PasswordField from '../components/PasswordField';
import StrengthMeter from '../components/StrengthMeter';
import Pager, { usePaged } from '../components/Pager';
import { useToast } from '../components/toast';

const ROLES = ['admin', 'analyst', 'stakeholder', 'public'];
const PERMS = [
  ['view_dashboard', 'Dashboard, map and stations'],
  ['view_analysis', 'Trend analysis'],
  ['view_readings', 'Browse readings'],
  ['export', 'Export CSV'],
  ['view_reports', 'Reports'],
  ['write_readings', 'Add, edit and import data'],
  ['manage_stations', 'Manage stations'],
  ['manage_bulletins', 'Prepare and publish alerts and bulletins'],
  ['manage_users', 'Manage users'],
  ['view_audit', 'Audit log'],
];

function ResetPassword({ user, onClose }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.resetPassword(user.id, password);
      toast.success(`Password reset for ${user.username}.`);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>Reset password</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p style={{ marginTop: 0, color: 'var(--muted-strong)', fontSize: 14 }}>
          Set a new temporary password for <b>{user.full_name}</b> ({user.username}). Share it securely, and ask them to change it under My account.
        </p>
        {error && <div className="alert error">{error}</div>}
        <PasswordField id="rp" label="New temporary password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)}>
          <StrengthMeter password={password} context={user} checklist />
        </PasswordField>
        <button className="btn block" disabled={busy}>{busy ? 'Saving…' : 'Reset password'}</button>
      </form>
    </div>
  );
}
const roleTone = { admin: 'danger', analyst: 'info', stakeholder: 'ok', public: '' };
const ago = (d) => (d ? new Date(d.replace(' ', 'T')).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never');

function CreateUser({ onClose, onCreated }) {
  const [form, setForm] = useState({ full_name: '', username: '', email: '', password: '', role: 'analyst' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.createUser(form);
      onCreated();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-back" onMouseDown={onClose}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <h3 style={{ margin: 0 }}>Add a user</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="field"><label htmlFor="cu-name">Full name</label>
          <input id="cu-name" className="input" required value={form.full_name} onChange={set('full_name')} /></div>
        <div className="two-col">
          <div className="field"><label htmlFor="cu-user">Username</label>
            <input id="cu-user" className="input" required autoComplete="off" value={form.username} onChange={set('username')} /></div>
          <div className="field"><label htmlFor="cu-mail">Email</label>
            <input id="cu-mail" className="input" type="email" required value={form.email} onChange={set('email')} /></div>
        </div>
        <div className="two-col">
          <PasswordField id="cu-pass" label="Temporary password" autoComplete="new-password" required
            value={form.password} onChange={set('password')}>
            <StrengthMeter password={form.password} context={form} checklist />
          </PasswordField>
          <div className="field"><label htmlFor="cu-role">Role</label>
            <select id="cu-role" className="input" value={form.role} onChange={set('role')}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select></div>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0 }}>
          Share the temporary password securely. The user can change it under My account.
        </p>
        <button className="btn block" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
      </form>
    </div>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(null);

  const load = () => api.users().then((d) => { setUsers(d.users); setMatrix(d.roles); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const update = async (u, changes) => {
    setError('');
    try {
      await api.updateUser({ id: u.id, role: u.role, is_active: u.is_active, ...changes });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const shown = useMemo(() => (users || []).filter((u) =>
    (!role || u.role === role)
    && (!query || `${u.full_name} ${u.username} ${u.email}`.toLowerCase().includes(query.toLowerCase()))), [users, role, query]);

  const { slice, pagerProps } = usePaged(shown, 10);

  const counts = useMemo(() => {
    const c = { total: 0, active: 0 };
    (users || []).forEach((u) => { c.total += 1; if (u.is_active) c.active += 1; c[u.role] = (c[u.role] || 0) + 1; });
    return c;
  }, [users]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users and roles</h1>
          <p>{users ? `${counts.total} users · ${counts.active} active` : 'Manage who can sign in and what they can do.'}</p>
        </div>
        <button className="btn" onClick={() => setAdding(true)}><UserPlus size={16} /> Add user</button>
      </div>
      {error && <div className="alert error">{error}</div>}

      <div className="role-tabs" role="tablist" aria-label="Filter by role">
        <button role="tab" aria-selected={!role} className={!role ? 'on' : ''} onClick={() => setRole('')}>All <b>{counts.total}</b></button>
        {ROLES.map((r) => (
          <button key={r} role="tab" aria-selected={role === r} className={role === r ? 'on' : ''} onClick={() => setRole(r)}>
            {r} <b>{counts[r] || 0}</b>
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="search">
          <Search size={16} />
          <input className="input" placeholder="Search name, username or email" aria-label="Search users"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!users ? (
          <div className="empty"><span className="spinner" /></div>
        ) : shown.length === 0 ? (
          <div className="empty">No users match.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>User</th><th>Role</th><th>Status</th><th>Last sign-in</th><th /></tr>
              </thead>
              <tbody>
                {slice.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="user-cell">
                        <span className="avatar">{u.full_name.charAt(0).toUpperCase()}</span>
                        <div><strong>{u.full_name}</strong><small>{u.username} · {u.email}</small></div>
                      </div>
                    </td>
                    <td>
                      <select className="input compact" value={u.role} disabled={u.id === me.id}
                        aria-label={`Role for ${u.username}`} onChange={(e) => update(u, { role: e.target.value })}>
                        {ROLES.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>
                      <button className="btn ghost compact" disabled={u.id === me.id}
                        onClick={() => update(u, { is_active: !u.is_active })}>
                        <span className={`badge ${u.is_active ? 'ok' : 'danger'}`}>{u.is_active ? 'Active' : 'Disabled'}</span>
                      </button>
                      {u.locked_until && (
                        <button className="btn ghost compact" style={{ marginLeft: 6 }} title={`Locked until ${u.locked_until}`}
                          onClick={async () => { try { await api.unlockUser(u.id); toast.success(`${u.username} was unlocked.`); await load(); } catch (e) { toast.error(e.message); } }}>
                          <span className="badge warn">Locked · Unlock</span>
                        </button>
                      )}
                    </td>
                    <td>{ago(u.last_login)}</td>
                    <td><button className="icon-btn" onClick={() => setResetting(u)} aria-label={`Reset password for ${u.username}`} title="Reset password"><KeyRound size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager {...pagerProps} label="users" sizes={[10, 25, 50]} />
      </div>

      {matrix && (
        <div className="card">
          <h3>What each role can do</h3>
          <div className="table-wrap">
            <table className="matrix">
              <thead>
                <tr><th>Permission</th>{ROLES.map((r) => <th key={r} className="center"><span className={`badge ${roleTone[r]}`}>{r}</span></th>)}</tr>
              </thead>
              <tbody>
                {PERMS.map(([key, label]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    {ROLES.map((r) => (
                      <td key={r} className="center">
                        {matrix[r]?.includes(key) ? <Check size={18} className="yes" aria-label="Allowed" /> : <Minus size={18} className="no" aria-label="Not allowed" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {resetting && <ResetPassword user={resetting} onClose={() => setResetting(null)} />}
      {adding && <CreateUser onClose={() => setAdding(false)} onCreated={() => { setAdding(false); load(); }} />}
    </>
  );
}
