import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api, isNetworkError } from '../api';
import { useAuth } from '../auth';
import { newId, queueAll, queueDelete, queuePut } from './db';

const Ctx = createContext({
  online: true, items: [], pending: 0, failed: 0, syncing: false, recent: [], lastSync: null,
  queueReading: async () => {}, syncNow: async () => {}, discard: async () => {}, updateItem: async () => {},
});

const BATCH = 50;
const RETRY_MS = 60 * 1000;

/**
 * Offline-first entry queue. Readings are written to IndexedDB first and sent in batches whenever the device is
 * online. The server saves by station and day (an upsert), so retrying a batch can never create duplicates.
 */
export function OfflineProvider({ children }) {
  const { user, can, verify } = useAuth();
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [items, setItems] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [recent, setRecent] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const busy = useRef(false);
  const writer = !!user && can('write_readings');

  const refresh = useCallback(async () => {
    const all = await queueAll();
    // Only the owner's entries are shown and sent: a different person signing in on a shared device must not send them
    setItems(all.filter((i) => i.userId === user?.id).sort((a, b) => a.createdAt - b.createdAt));
  }, [user?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const syncNow = useCallback(async () => {
    if (busy.current || !writer) return;
    const all = (await queueAll()).filter((i) => i.userId === user.id && i.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
    if (!all.length) return;
    busy.current = true;
    setSyncing(true);
    try {
      for (let start = 0; start < all.length; start += BATCH) {
        const chunk = all.slice(start, start + BATCH);
        let res;
        try {
          res = await api.syncBatch(chunk.map((c) => c.payload));
        } catch (e) {
          if (e instanceof ApiError && e.status === 419) { await verify(); res = await api.syncBatch(chunk.map((c) => c.payload)); } else throw e;
        }
        const done = [];
        for (const r of res.results) {
          const item = chunk[r.index];
          if (!item) continue;
          if (r.ok) {
            await queueDelete(item.id);
            done.push({ ...item, syncedAt: Date.now(), flagged: r.flagged });
          } else {
            await queuePut({ ...item, status: 'failed', error: r.error });
          }
        }
        if (done.length) setRecent((cur) => [...done, ...cur].slice(0, 15));
      }
      setLastSync(Date.now());
      setOnline(true);
    } catch (e) {
      if (isNetworkError(e)) setOnline(false); // try again when the connection returns
      // 401: the session expired. The queue stays on the device and the sign-in screen takes over.
    } finally {
      busy.current = false;
      setSyncing(false);
      await refresh();
    }
  }, [writer, user?.id, verify, refresh]);

  const queueReading = useCallback(async (payload) => {
    const item = { id: newId(), payload, createdAt: Date.now(), status: 'pending', error: null, userId: user.id, username: user.username };
    await queuePut(item);
    await refresh();
    if (navigator.onLine) syncNow();
    return item;
  }, [user, refresh, syncNow]);

  const discard = useCallback(async (id) => { await queueDelete(id); await refresh(); }, [refresh]);

  /** Edit a queued entry (used to fix one the server rejected) and send it again. */
  const updateItem = useCallback(async (id, payload) => {
    const cur = (await queueAll()).find((i) => i.id === id);
    if (!cur) return;
    await queuePut({ ...cur, payload, status: 'pending', error: null });
    await refresh();
    if (navigator.onLine) syncNow();
  }, [refresh, syncNow]);

  // Connectivity: browser events, plus a periodic retry while something is waiting
  useEffect(() => {
    const on = () => { setOnline(true); setTimeout(syncNow, 800); }; // wait for AuthProvider to refresh the CSRF token
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const onVisible = () => { if (document.visibilityState === 'visible' && navigator.onLine) syncNow(); };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => { if (navigator.onLine) syncNow(); }, RETRY_MS);
    syncNow();
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [syncNow]);

  // Fetch the field-entry screen while online so the service worker keeps it for offline use
  useEffect(() => { if (writer) import('../pages/FieldEntry').catch(() => {}); }, [writer]);

  const value = useMemo(() => ({
    online,
    items,
    pending: items.filter((i) => i.status === 'pending').length,
    failed: items.filter((i) => i.status === 'failed').length,
    syncing, recent, lastSync, queueReading, syncNow, discard, updateItem,
  }), [online, items, syncing, recent, lastSync, queueReading, syncNow, discard, updateItem]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useOffline = () => useContext(Ctx);
