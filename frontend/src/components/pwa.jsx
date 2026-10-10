import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, RefreshCw, UploadCloud, WifiOff } from 'lucide-react';
import { useAuth } from '../auth';
import { useOffline } from '../offline/OfflineProvider';

/** Registers the service worker (production builds only). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL; // "/" or "/CDIMS/", set at build time
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {});
  });
}

/** Captures the browser's install prompt so the UI can offer an "Install app" button. */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(
    typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches,
  );

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return { canInstall: !!deferred && !installed, install };
}

export function InstallButton({ className = 'btn ghost block' }) {
  const { canInstall, install } = useInstallPrompt();
  if (!canInstall) return null;
  return <button className={className} onClick={install}><Download size={16} /> Install app</button>;
}

/** Banner shown while the device has no connection. Staff who can enter data are told their entries are safe. */
export function OfflineBanner() {
  const { online, pending } = useOffline();
  const { can } = useAuth();
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      <WifiOff size={16} />
      {can('write_readings')
        ? <span>You are offline. Use <Link to="/app/field-entry">Field entry</Link>: observations are saved on this device{pending ? ` (${pending} waiting)` : ''} and sent when you reconnect.</span>
        : <span>You are offline. Climate data needs a connection and will reload when you are back online.</span>}
    </div>
  );
}

/** Small chip in the top bar: offline state and how many entries are waiting to send. */
export function SyncStatus() {
  const { online, pending, failed, syncing } = useOffline();
  const { can } = useAuth();
  if (!can('write_readings')) return online ? null : <span className="sync-chip off"><WifiOff size={14} /> Offline</span>;
  if (online && !pending && !failed) return null;
  return (
    <Link to="/app/field-entry" className={`sync-chip ${online ? (failed ? 'bad' : 'wait') : 'off'}`} title="Open Field entry">
      {syncing ? <RefreshCw size={14} className="spin" /> : online ? <UploadCloud size={14} /> : <WifiOff size={14} />}
      {!online && 'Offline · '}{failed ? `${failed} need attention` : `${pending} to send`}
    </Link>
  );
}
