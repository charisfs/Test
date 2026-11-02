// Tiny IndexedDB wrapper. Everything stays on the device.
const DB_NAME = 'outfitly';
const DB_VERSION = 1;
const STORES = ['items', 'trips', 'history', 'kv'];

let dbPromise;
function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const db = {
  all: (store) => tx(store, 'readonly', (s) => s.getAll()),
  get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
  put: (store, value) => tx(store, 'readwrite', (s) => s.put(value)),
  del: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
  async putMany(store, values) {
    const d = await open();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, 'readwrite');
      const s = t.objectStore(store);
      values.forEach((v) => s.put(v));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
};

// Simple key/value settings
export const settings = {
  async get(key, fallback) {
    const row = await db.get('kv', key);
    return row ? row.value : fallback;
  },
  set: (key, value) => db.put('kv', { id: key, value }),
};

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// Ask Safari to keep our data (prevents eviction of a home-screen app's storage).
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch { /* not supported */ }
}

export async function exportAll() {
  const out = { app: 'outfitly', version: 1, exportedAt: new Date().toISOString() };
  for (const s of STORES) {
    out[s] = await db.all(s);
  }
  // Never export the API key.
  out.kv = out.kv.filter((r) => r.id !== 'apiKey');
  return out;
}

export async function importAll(data) {
  if (!data || data.app !== 'outfitly') throw new Error('Not an Outfitly backup file');
  for (const s of STORES) {
    if (Array.isArray(data[s])) await db.putMany(s, data[s]);
  }
}
