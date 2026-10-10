import { useEffect, useState } from 'react';
import { Check, Clock, Lock, LogOut, Monitor, Moon, Palette, Save, ShieldCheck, Sun, User as UserIcon } from 'lucide-react';
import Avatar, { AVATARS } from '../components/Avatar';
import Confirm from '../components/Confirm';
import PasswordField from '../components/PasswordField';
import StrengthMeter, { analyse } from '../components/StrengthMeter';
import { useToast } from '../components/toast';
import { useUnsavedGuard } from '../components/unsaved';
import { api } from '../api';
import { useAuth } from '../auth';
import { applyThemePref } from '../theme';

const THEMES = [
  { id: 'system', label: 'System', hint: 'Match my device', icon: Monitor },
  { id: 'light', label: 'Light', hint: 'Bright interface', icon: Sun },
  { id: 'dark', label: 'Dark', hint: 'Easier in low light', icon: Moon },
];

const PAGES = [
  ['/app', 'Dashboard', 'view_dashboard'],
  ['/app/analysis', 'Analysis', 'view_analysis'],
  ['/app/data', 'Climate data', 'view_readings'],
  ['/app/stations', 'Stations', 'view_dashboard'],
  ['/app/reports', 'Reports', 'view_reports'],
];

const SIDEBAR_KEY = 'cdims-sidebar-collapsed';
const roleTone = { admin: 'danger', analyst: 'info', stakeholder: 'ok', public: '' };
const fmt = (d, o) => (d ? new Date(d.replace(' ', 'T')).toLocaleDateString('en', o) : 'Never');

function ProfileForm({ user, onSaved, onDirty }) {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: user.full_name, email: user.email });
  const [busy, setBusy] = useState(false);
  const dirty = form.full_name !== user.full_name || form.email !== user.email;
  useEffect(() => onDirty(dirty), [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api.saveProfile(form);
      onSaved(d.user);
      toast.success('Profile saved.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h3>Personal details</h3>
      <div className="field"><label htmlFor="pf-name">Full name</label>
        <input id="pf-name" className="input" required maxLength={100} value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
      <div className="field"><label htmlFor="pf-mail">Email</label>
        <input id="pf-mail" className="input" type="email" required value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
      <div className="field"><label htmlFor="pf-user">Username</label>
        <div className="ro">
          <Lock size={15} />
          <input id="pf-user" className="input" value={user.username} readOnly aria-describedby="pf-user-hint" />
        </div>
        <small id="pf-user-hint" className="hint">Usernames are fixed. Ask an administrator if you need a different one.</small></div>
      <div className="form-actions">
        <button className="btn" disabled={busy || !dirty}><Save size={16} /> {busy ? 'Saving…' : 'Save profile'}</button>
        {dirty && <span className="unsaved"><i /> Unsaved changes</span>}
      </div>
    </form>
  );
}

function Preferences({ user, onSaved, onDirty }) {
  const toast = useToast();
  const { can } = useAuth();
  const [prefs, setPrefs] = useState(user.preferences);
  const [stations, setStations] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.stations().then((d) => setStations(d.stations)).catch(() => {}); }, []);

  const set = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));
  const dirty = JSON.stringify(prefs) !== JSON.stringify(user.preferences);
  useEffect(() => onDirty(dirty), [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const pages = PAGES.filter(([, , perm]) => can(perm));

  // A theme preview that is not saved must not outlive the page
  useEffect(() => () => applyThemePref(user.preferences.theme), []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api.savePreferences(prefs);
      applyThemePref(d.user.preferences.theme);
      try { localStorage.setItem(SIDEBAR_KEY, d.user.preferences.sidebar === 'collapsed' ? '1' : '0'); } catch { /* storage unavailable */ }
      window.dispatchEvent(new Event('cdims-prefs'));
      onSaved(d.user);
      toast.success('Preferences saved. They will follow you on any device.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={save}>
      <h3><Palette size={16} style={{ verticalAlign: -3 }} /> Appearance</h3>
      <fieldset className="pref">
        <legend>Theme</legend>
        <div className="theme-cards">
          {THEMES.map(({ id, label, hint, icon: Icon }) => (
            <label key={id} className={`theme-card ${prefs.theme === id ? 'on' : ''}`}>
              <input type="radio" name="theme" value={id} checked={prefs.theme === id}
                onChange={() => { set('theme', id); applyThemePref(id); }} />
              <Icon size={20} />
              <strong>{label}</strong>
              <small>{hint}</small>
            </label>
          ))}
        </div>
        <small className="hint">The theme previews immediately. Save to keep it.</small>
      </fieldset>

      <fieldset className="pref">
        <legend>Avatar colour</legend>
        <div className="swatches" role="radiogroup" aria-label="Avatar colour">
          {AVATARS.map((c) => (
            <label key={c} className={`sw av-${c} ${prefs.avatar === c ? 'on' : ''}`} title={c}>
              <input type="radio" name="avatar" value={c} checked={prefs.avatar === c} onChange={() => set('avatar', c)} />
              {prefs.avatar === c && <Check size={16} />}
              <span className="sr-only">{c}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <h3 style={{ marginTop: 22 }}>Start up</h3>
      <div className="two-col">
        <div className="field"><label htmlFor="pf-start">Open this page after sign-in</label>
          <select id="pf-start" className="input" value={prefs.start_page} onChange={(e) => set('start_page', e.target.value)}>
            {pages.map(([to, label]) => <option key={to} value={to}>{label}</option>)}
          </select></div>
        <div className="field"><label htmlFor="pf-station">Default dashboard station</label>
          <select id="pf-station" className="input" value={prefs.default_station ?? ''}
            onChange={(e) => set('default_station', e.target.value ? Number(e.target.value) : null)}>
            <option value="">All stations</option>
            {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>
      </div>

      <fieldset className="pref">
        <legend>Sidebar on desktop</legend>
        <div className="seg">
          {['expanded', 'collapsed'].map((v) => (
            <label key={v} className={prefs.sidebar === v ? 'on' : ''}>
              <input type="radio" name="sidebar" value={v} checked={prefs.sidebar === v} onChange={() => set('sidebar', v)} />
              {v === 'expanded' ? 'Expanded' : 'Icons only'}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="form-actions">
        <button className="btn" disabled={busy || !dirty}><Save size={16} /> {busy ? 'Saving…' : 'Save preferences'}</button>
        {dirty && <span className="unsaved"><i /> Unsaved changes</span>}
      </div>
    </form>
  );
}

const fmtWhen = (d) => (d ? new Date(d.replace(' ', 'T')).toLocaleString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/** Every browser currently signed in to this account, with the option to end the others. */
function ActiveSessions() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState('');

  const load = () => api.sessions().then((d) => setList(d.sessions)).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const revoke = async (handle) => {
    setBusy(handle);
    try { await api.revokeSession(handle); toast.success('That device was signed out.'); await load(); } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  return (
    <div className="card">
      <h3><Monitor size={16} style={{ verticalAlign: -3 }} /> Where you are signed in</h3>
      {!list ? <div className="empty" style={{ padding: 12 }}><span className="spinner" /></div> : (
        <ul className="queue">
          {list.map((s) => (
            <li key={s.handle}>
              <div>
                <b>{s.device}</b> {s.current && <span className="badge ok">This device</span>}
                <small>{s.ip || 'unknown address'} · signed in {fmtWhen(s.created_at)}</small>
                <small className="muted">Last active {fmtWhen(s.last_seen)}</small>
              </div>
              {!s.current && <button className="btn ghost compact" onClick={() => revoke(s.handle)} disabled={busy === s.handle}>{busy === s.handle ? 'Ending…' : 'Sign out'}</button>}
            </li>
          ))}
        </ul>
      )}
      <p className="sec-text" style={{ margin: '12px 0 0' }}>
        Sessions end automatically after a period of inactivity, and after at most 12 hours. If you see a device you do not recognise, sign it out and change your password.
      </p>
    </div>
  );
}

function Security({ onDirty, user }) {
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [outBusy, setOutBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const dirty = !!(form.current || form.next || form.confirm);
  useEffect(() => onDirty(dirty), [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const mismatch = form.confirm !== '' && form.confirm !== form.next;

  const submit = async (e) => {
    e.preventDefault();
    if (mismatch) return toast.error('New passwords do not match.');
    setBusy(true);
    try {
      await api.changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      toast.success('Password updated. Your other devices were signed out.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const signOutAll = async () => {
    setOutBusy(true);
    try {
      await api.signOutEverywhere();
      toast.success('Signed out of all other devices.');
      setConfirmOut(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setOutBusy(false);
    }
  };

  return (
    <>
      <form className="card" onSubmit={submit}>
        <h3><ShieldCheck size={16} style={{ verticalAlign: -3 }} /> Change password</h3>
        <PasswordField id="p-cur" label="Current password" autoComplete="current-password" required value={form.current} onChange={set('current')} />
        <div className="two-col">
          <PasswordField id="p-new" label="New password" autoComplete="new-password" required value={form.next} onChange={set('next')}>
            <StrengthMeter password={form.next} context={user} checklist />
          </PasswordField>
          <PasswordField id="p-conf" label="Confirm new password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')}
            invalid={mismatch} valid={form.confirm !== '' && !mismatch} hint={mismatch ? 'Passwords do not match' : undefined} />
        </div>
        <div className="form-actions">
          <button className="btn" disabled={busy || !analyse(form.next, user).ok}>{busy ? 'Saving…' : 'Update password'}</button>
          {form.next && !analyse(form.next, user).ok && <small className="hint">Meet every rule above to continue.</small>}
        </div>
      </form>

      <ActiveSessions />

      <div className="card">
        <h3><LogOut size={16} style={{ verticalAlign: -3 }} /> Sign out everywhere</h3>
        <p className="sec-text">
          If you used CDIMS on a shared or lost device, sign out everywhere. You stay signed in here, and every other
          device will need to sign in again. Changing your password does this automatically.
        </p>
        <button className="btn ghost" onClick={() => setConfirmOut(true)}><LogOut size={16} /> Sign out of all other devices</button>
      </div>

      {confirmOut && (
        <Confirm title="Sign out of all other devices?" confirmLabel="Sign them out" danger busy={outBusy} onConfirm={signOutAll} onCancel={() => setConfirmOut(false)}>
          Anyone using your account on another browser or phone will be signed out immediately.
        </Confirm>
      )}
    </>
  );
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [tab, setTab] = useState('general');
  const [dirty, setDirty] = useState({ profile: false, prefs: false, security: false });
  const mark = (k) => (v) => setDirty((d) => (d[k] === v ? d : { ...d, [k]: v }));
  useUnsavedGuard(dirty.profile || dirty.prefs || dirty.security);

  const tabs = [
    { id: 'general', label: 'General', icon: UserIcon, dirty: dirty.profile },
    { id: 'preferences', label: 'Preferences', icon: Palette, dirty: dirty.prefs },
    { id: 'security', label: 'Security', icon: ShieldCheck, dirty: dirty.security },
  ];

  return (
    <>
      <div className="page-head"><div><h1>My account</h1><p>Update your details, choose how CDIMS looks and starts, and keep your account secure.</p></div></div>

      <div className="account">
        <aside className="card identity">
          <Avatar user={user} size={84} />
          <h2>{user.full_name}</h2>
          <span className={`role-badge ${roleTone[user.role]}`}><ShieldCheck size={14} /> {user.role}</span>
          <dl>
            <div><dt>Username</dt><dd>{user.username}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt><Clock size={13} /> Member since</dt><dd>{fmt(user.created_at, { month: 'long', year: 'numeric' })}</dd></div>
            <div><dt>Last sign-in</dt><dd>{fmt(user.last_login, { day: 'numeric', month: 'short', year: 'numeric' })}</dd></div>
          </dl>
        </aside>

        <div className="account-main">
          <div className="role-tabs" role="tablist" aria-label="Account sections">
            {tabs.map(({ id, label, icon: Icon, dirty: d }) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                <Icon size={15} /> {label} {d && <i className="dirty-dot" title="Unsaved changes" />}
              </button>
            ))}
          </div>
          {/* All panels stay mounted so edits survive switching tabs */}
          <div className="stack" hidden={tab !== 'general'}><ProfileForm user={user} onSaved={updateUser} onDirty={mark('profile')} /></div>
          <div className="stack" hidden={tab !== 'preferences'}><Preferences user={user} onSaved={updateUser} onDirty={mark('prefs')} /></div>
          <div className="stack" hidden={tab !== 'security'}><Security onDirty={mark('security')} user={user} /></div>
        </div>
      </div>
    </>
  );
}
