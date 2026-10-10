// Tiny IndexedDB wrapper. Holds the offline entry queue and a few cached lookups (stations, last user).
const DB_NAME = 'cdims-offline';
const VERSION = 1;

let dbPromise;
function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB is not available')); return; }
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const queueAll = () => run('queue', 'readonly', (s) => s.getAll()).catch(() => []);
export const queuePut = (item) => run('queue', 'readwrite', (s) => s.put(item));
export const queueDelete = (id) => run('queue', 'readwrite', (s) => s.delete(id));
export const kvGet = (key) => run('kv', 'readonly', (s) => s.get(key)).catch(() => undefined);
export const kvSet = (key, value) => run('kv', 'readwrite', (s) => s.put(value, key)).catch(() => {});
export const kvDelete = (key) => run('kv', 'readwrite', (s) => s.delete(key)).catch(() => {});

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
