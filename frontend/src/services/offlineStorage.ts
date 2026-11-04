export interface OfflinePage {
  pageName: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  version: number;
  syncStatus: 'synced' | 'pending' | 'conflict' | 'expired';
  serverTimestamp?: number;
  isLocalOnly?: boolean;
}

export interface SyncAction {
  id: string;
  type: 'save_content' | 'create_page';
  pageName: string;
  payload: {
    text?: string;
    version?: number;
    password?: string;
  };
  createdAt: number;
  retryCount: number;
}

export interface QueuedOfflineFile {
  id: string;
  pageName: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

const DB_NAME = 'blinkpad_offline_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this browser.'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('pages')) {
        db.createObjectStore('pages', { keyPath: 'pageName' });
      }

      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
        syncStore.createIndex('pageName', 'pageName', { unique: false });
      }

      if (!db.objectStoreNames.contains('queuedFiles')) {
        const fileStore = db.createObjectStore('queuedFiles', { keyPath: 'id' });
        fileStore.createIndex('pageName', 'pageName', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function saveOfflinePage(page: OfflinePage): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readwrite');
    const store = tx.objectStore('pages');
    const req = store.put(page);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getOfflinePage(pageName: string): Promise<OfflinePage | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readonly');
    const store = tx.objectStore('pages');
    const req = store.get(pageName.toLowerCase());
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllOfflinePages(): Promise<OfflinePage[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readonly');
    const store = tx.objectStore('pages');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteOfflinePage(pageName: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pages', 'readwrite');
    const store = tx.objectStore('pages');
    const req = store.delete(pageName.toLowerCase());
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function addSyncAction(action: SyncAction): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const req = store.put(action);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingSyncActions(): Promise<SyncAction[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readonly');
    const store = tx.objectStore('syncQueue');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeSyncAction(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('syncQueue', 'readwrite');
    const store = tx.objectStore('syncQueue');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function queueOfflineFile(pageName: string, file: File): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();
  const record: QueuedOfflineFile = {
    id,
    pageName: pageName.toLowerCase(),
    name: file.name,
    type: file.type,
    size: file.size,
    blob: file,
    createdAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction('queuedFiles', 'readwrite');
    const store = tx.objectStore('queuedFiles');
    const req = store.put(record);
    req.onsuccess = () => resolve(id);
    req.onerror = () => reject(req.error);
  });
}

export async function getQueuedOfflineFiles(pageName: string): Promise<QueuedOfflineFile[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queuedFiles', 'readonly');
    const store = tx.objectStore('queuedFiles');
    const index = store.index('pageName');
    const req = index.getAll(pageName.toLowerCase());
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedOfflineFile(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queuedFiles', 'readwrite');
    const store = tx.objectStore('queuedFiles');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

