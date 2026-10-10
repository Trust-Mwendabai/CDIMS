import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, CloudSun, Loader2 } from 'lucide-react';
import PasswordField from '../components/PasswordField';
import StrengthMeter, { analyse } from '../components/StrengthMeter';
import ThemeToggle from '../components/ThemeToggle';
import { api } from '../api';
import { useAuth } from '../auth';

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth">
      <div className="auth-aside">
        <div className="brand" style={{ color: '#fff', padding: 0 }}><CloudSun size={24} /> CDIMS</div>
        <div>
          <h2>One trusted source for Zambia’s climate record.</h2>
          <p>Manage, validate and explore station observations from across the national network.</p>
        </div>
        <small style={{ opacity: 0.8 }}>Zambia Meteorology Department</small>
      </div>
      <div className="auth-form">
        <ThemeToggle className="auth-theme" />
        <div className="auth-card panel">
          <Link to="/" className="back-home"><ArrowLeft size={16} /> Back to home</Link>
          <div className="auth-badge">
            <span className="auth-logo"><CloudSun size={22} /></span>
            <span>Climate Data Integration<br />&amp; Management System</span>
          </div>
          <h1>{title}</h1>
          <p className="sub">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({ label, id, valid, invalid, hint, ...props }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className={`input ${valid ? 'is-valid' : ''} ${invalid ? 'is-invalid' : ''}`} {...props} />
      {hint && <small className={invalid ? 'hint bad' : 'hint'}>{hint}</small>}
    </div>
  );
}

function SubmitButton({ busy, idle, working }) {
  return (
    <button className="btn block lg" disabled={busy}>
      {busy ? <><Loader2 size={18} className="spin" /> {working}</> : idle}
    </button>
  );
}

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Set by the app when the server ended the session (idle, revoked, role changed)
  const [expired] = useState(() => {
    try { const v = sessionStorage.getItem('cdims-expired') === '1'; sessionStorage.removeItem('cdims-expired'); return v; } catch { return false; }
  });

  if (user) return <Navigate to="/app" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(form.identifier, form.password);
      navigate(location.state?.from || u.preferences?.start_page || '/app', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to access the dashboard.">
      {location.state?.registered && <div className="alert ok">Account created. You can sign in now.</div>}
      {expired && <div className="alert info" role="status">You were signed out for your security: your session ended after inactivity, or was ended from another device. Sign in again to continue. Anything you saved offline is still on this device.</div>}
      {error && <div className="alert error" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <Field id="identifier" label="Username or email" autoComplete="username" required autoFocus
          value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
        <PasswordField id="password" label="Password" autoComplete="current-password" required
          value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <SubmitButton busy={busy} idle="Sign in" working="Signing in…" />
      </form>
      <p className="sub" style={{ marginTop: 20 }}>No account? <Link to="/register">Create one</Link></p>
    </AuthShell>
  );
}

export function Register() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', username: '', email: '', password: '', confirm: '' });
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/app" replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const blur = (k) => () => setTouched({ ...touched, [k]: true });

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const userOk = /^[A-Za-z0-9_.-]{3,50}$/.test(form.username);
  const pwCtx = { username: form.username, email: form.email, full_name: form.full_name };
  const pwOk = analyse(form.password, pwCtx).ok;
  const matchOk = form.confirm !== '' && form.confirm === form.password;

  const submit = async (e) => {
    e.preventDefault();
    if (!pwOk) { setTouched({ ...touched, password: true }); setError('Please choose a password that meets every rule below.'); return; }
    if (!matchOk) { setTouched({ ...touched, confirm: true }); return; }
    setBusy(true);
    setError('');
    try {
      const { confirm, ...payload } = form;
      await api.register(payload);
      navigate('/login', { state: { registered: true } });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="New accounts get read-only access until an administrator assigns a role.">
      {error && <div className="alert error" role="alert">{error}</div>}
      <form onSubmit={submit} noValidate={false}>
        <Field id="full_name" label="Full name" autoComplete="name" required value={form.full_name} onChange={set('full_name')} />
        <div className="two-col">
          <Field id="username" label="Username" autoComplete="username" required value={form.username}
            onChange={set('username')} onBlur={blur('username')}
            valid={userOk} invalid={touched.username && !userOk}
            hint={touched.username && !userOk ? '3-50 letters, numbers, . _ -' : undefined} />
          <Field id="email" label="Email" type="email" autoComplete="email" required value={form.email}
            onChange={set('email')} onBlur={blur('email')}
            valid={emailOk} invalid={touched.email && !emailOk}
            hint={touched.email && !emailOk ? 'Enter a valid email address' : undefined} />
        </div>
        <div className="two-col">
          <PasswordField id="password" label="Password" autoComplete="new-password" required
            value={form.password} onChange={set('password')} onBlur={blur('password')}
            valid={pwOk} invalid={touched.password && !pwOk}>
            <StrengthMeter password={form.password} context={pwCtx} checklist />
          </PasswordField>
          <PasswordField id="confirm" label="Confirm password" autoComplete="new-password" required
            value={form.confirm} onChange={set('confirm')} onBlur={blur('confirm')}
            valid={matchOk} invalid={touched.confirm && !matchOk}
            hint={form.confirm && !matchOk ? 'Passwords do not match' : matchOk ? undefined : ' '}>
            {matchOk && <small className="hint good"><CheckCircle2 size={13} /> Passwords match</small>}
          </PasswordField>
        </div>
        <SubmitButton busy={busy} idle="Create account" working="Creating account…" />
      </form>
      <p className="sub" style={{ marginTop: 20 }}>Already registered? <Link to="/login">Sign in</Link></p>
    </AuthShell>
  );
}
