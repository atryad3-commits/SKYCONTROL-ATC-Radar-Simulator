/**
 * SKYCONTROL - Browser IndexedDB Persistent WAV Audio Cache
 * Caches decoded ArrayBuffers of local Kokoro-generated WAV speech across sessions
 * with LRU eviction and graceful in-memory fallback when IndexedDB is unavailable.
 */

const DB_NAME = 'skycontrol_wav_cache_v1';
const STORE_NAME = 'wav_entries';
const MAX_LOCAL_CACHE_BYTES = 150 * 1024 * 1024;

export interface BrowserCachedWavRecord {
  cacheKey: string;
  voiceId: string;
  normalizedText: string;
  speed: number;
  wavBytes: ArrayBuffer;
  sizeBytes: number;
  durationSec: number;
  lastAccessedAt: number;
}

class BrowserAudioCacheDb {
  private memoryFallback = new Map<string, BrowserCachedWavRecord>();
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  private openDb(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    if (typeof indexedDB === 'undefined') {
      this.dbPromise = Promise.resolve(null);
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase | null>(resolve => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
            store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  public async get(cacheKey: string): Promise<BrowserCachedWavRecord | null> {
    const mem = this.memoryFallback.get(cacheKey);
    if (mem) {
      mem.lastAccessedAt = Date.now();
      return mem;
    }

    const db = await this.openDb();
    if (!db) return null;

    return new Promise<BrowserCachedWavRecord | null>(resolve => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(cacheKey);
        req.onsuccess = () => {
          const record = req.result as BrowserCachedWavRecord | undefined;
          if (!record) {
            resolve(null);
            return;
          }
          record.lastAccessedAt = Date.now();
          store.put(record);
          this.memoryFallback.set(cacheKey, record);
          resolve(record);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  public async put(record: Omit<BrowserCachedWavRecord, 'lastAccessedAt'>): Promise<void> {
    const fullRecord: BrowserCachedWavRecord = {
      ...record,
      lastAccessedAt: Date.now(),
    };
    this.memoryFallback.set(record.cacheKey, fullRecord);
    if (this.memoryFallback.size > 160) {
      const oldestKey = this.memoryFallback.keys().next().value;
      if (oldestKey) this.memoryFallback.delete(oldestKey);
    }

    const db = await this.openDb();
    if (!db) return;

    await new Promise<void>(resolve => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(fullRecord);
        tx.oncomplete = () => {
          void this.evictIfNeeded(db);
          resolve();
        };
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  private async evictIfNeeded(db: IDBDatabase): Promise<void> {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as BrowserCachedWavRecord[]) || [];
        let totalBytes = all.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);
        if (totalBytes <= MAX_LOCAL_CACHE_BYTES) return;
        all.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
        for (const victim of all) {
          if (totalBytes <= MAX_LOCAL_CACHE_BYTES * 0.8) break;
          store.delete(victim.cacheKey);
          totalBytes -= victim.sizeBytes || 0;
        }
      };
    } catch {
      // Ignore LRU sweep failures
    }
  }

  public async clear(): Promise<void> {
    this.memoryFallback.clear();
    const db = await this.openDb();
    if (!db) return;
    await new Promise<void>(resolve => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

export const audioCacheDb = new BrowserAudioCacheDb();
