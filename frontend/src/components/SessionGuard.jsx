import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';

const WARN_BEFORE = 120; // seconds of warning before an idle sign-out
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

/**
 * Mirrors the server's idle timeout. While the person is active it quietly keeps the session alive; when they have been
 * inactive it warns two minutes before the server would end the session, and signs out locally when time is up.
 */
export default function SessionGuard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const idleLimit = user?.session?.idle_seconds || 3600;
  const last = useRef(Date.now());          // last real user activity
  const lastPing = useRef(Date.now());      // last time the server saw us
  const [left, setLeft] = useState(null);   // seconds until sign-out, only while the warning shows

  const stay = useCallback(async () => {
    last.current = Date.now();
    lastPing.current = Date.now();
    setLeft(null);
    try { await api.me(); } catch { /* the next tick will notice a dead session */ }
  }, []);

  const expire = useCallback(async () => {
    try { sessionStorage.setItem('cdims-expired', '1'); } catch { /* storage unavailable */ }
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  useEffect(() => {
    const mark = () => { last.current = Date.now(); };
    EVENTS.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    return () => EVENTS.forEach((e) => window.removeEventListener(e, mark));
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const idleFor = (now - last.current) / 1000;
      // Active recently and the server has not heard from us for a third of the limit: keep the session alive
      if (idleFor < 60 && (now - lastPing.current) / 1000 > idleLimit / 3) {
        lastPing.current = now;
        api.me().catch(() => {});
      }
      const remaining = Math.round(idleLimit - idleFor);
      if (remaining <= 0) expire();
      else setLeft(remaining <= WARN_BEFORE ? remaining : null);
    }, 1000);
    return () => clearInterval(id);
  }, [idleLimit, expire]);

  if (left === null) return null;
  return (
    <div className="modal-back" role="alertdialog" aria-labelledby="sg-title" aria-modal="true">
      <div className="modal confirm" onMouseDown={(e) => e.stopPropagation()}>
        <h3 id="sg-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Clock size={18} /> Still there?</h3>
        <p style={{ color: 'var(--muted-strong)', fontSize: 14, margin: '0 0 6px' }}>
          For your security you will be signed out in <b>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</b> because there has been no activity.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 18px' }}>Anything saved offline stays on this device.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={expire}>Sign out now</button>
          <button className="btn" onClick={stay} autoFocus>Stay signed in</button>
        </div>
      </div>
    </div>
  );
}
