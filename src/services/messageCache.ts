// Lightweight IndexedDB wrapper for caching chats and messages
// Keeps schema minimal: store 'conversations' and 'messages'
const DB_NAME = 'bulsu_space_msg_cache_v1';
const DB_VERSION = 1;
const CONVERSATIONS_STORE = 'conversations';
const MESSAGES_STORE = 'messages';

// Buffer for batching message writes to IndexedDB
let writeBuffer: { conversationId: string; message: any }[] = [];
let flushTimer: number | null = null;
const FLUSH_INTERVAL = 450; // ms
const MAX_BUFFER = 500;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB not available'));
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
        db.createObjectStore(CONVERSATIONS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        const msgs = db.createObjectStore(MESSAGES_STORE, { keyPath: ['conversationId', 'id'] });
        msgs.createIndex('byConversation', 'conversationId', { unique: false });
        msgs.createIndex('byCreatedAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, cb: (store: IDBObjectStore) => Promise<T> | T) {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction([storeName], mode);
    const store = tx.objectStore(storeName);
    Promise.resolve(cb(store)).then((v) => {
      tx.oncomplete = () => resolve(v);
      tx.onerror = () => reject(tx.error);
    }).catch(err => {
      tx.abort();
      reject(err);
    });
  });
}

export async function saveConversation(conv: any) {
  try {
    await withStore(CONVERSATIONS_STORE, 'readwrite', store => {
      store.put(conv);
      return Promise.resolve(true);
    });
  } catch (e) {
    console.error('messageCache.saveConversation error', e);
  }
}

export async function getAllConversations(): Promise<any[]> {
  return await withStore(CONVERSATIONS_STORE, 'readonly', store => {
    return new Promise<any[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function saveMessages(conversationId: string, messages: any[]) {
  if (!Array.isArray(messages) || messages.length === 0) return;
  // Buffer writes
  for (const m of messages) {
    writeBuffer.push({ conversationId, message: m });
    if (writeBuffer.length >= MAX_BUFFER) {
      // flush immediately if buffer is large
      flushWrites().catch(err => console.debug('flushWrites error', err));
    }
  }
  // Schedule flush
  if (flushTimer) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => { flushWrites().catch(err => console.debug('flushWrites error', err)); }, FLUSH_INTERVAL);
}

async function flushWrites() {
  if (writeBuffer.length === 0) return;
  const toFlush = writeBuffer.splice(0, writeBuffer.length);
  try {
    await withStore(MESSAGES_STORE, 'readwrite', store => {
      for (const item of toFlush) {
        try {
          const m = item.message;
          const copy = { ...m, conversationId: item.conversationId, createdAt: m.createdAt && typeof m.createdAt.toMillis === 'function' ? m.createdAt.toMillis() : (m.createdAt || Date.now()) };
          store.put(copy);
        } catch (e) {
          console.debug('messageCache.flushWrites item skip', e);
        }
      }
      return Promise.resolve(true);
    });
  } catch (e) {
    console.error('messageCache.flushWrites error', e);
    // requeue on failure
    writeBuffer.unshift(...toFlush.slice(0, Math.min(toFlush.length, MAX_BUFFER)));
  }
}

// Flush pending writes on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try { if (flushTimer) window.clearTimeout(flushTimer); flushWrites(); } catch (e) { /* ignore */ }
  });
}

export async function getMessagesForConversation(conversationId: string, limit = 50, beforeCreatedAt?: number) {
  return await withStore(MESSAGES_STORE, 'readonly', store => {
    return new Promise<any[]>((resolve, reject) => {
      const idx = store.index('byConversation');
      const range = IDBKeyRange.only(conversationId);
      const req = idx.openCursor(range, 'prev'); // newest first
      const out: any[] = [];
      req.onsuccess = (ev) => {
        const cur = (ev.target as IDBRequest).result as IDBCursorWithValue | null;
        if (!cur || out.length >= limit) return resolve(out);
        const val = cur.value;
        if (beforeCreatedAt && val.createdAt >= beforeCreatedAt) {
          cur.continue();
          return;
        }
        out.push(val);
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  });
}

export async function getLatestMessageTimestamp(conversationId: string): Promise<number | null> {
  const msgs = await getMessagesForConversation(conversationId, 1);
  if (!msgs || msgs.length === 0) return null;
  return msgs[0].createdAt || null;
}

export async function clearAll() {
  try {
    const db = await openDB();
    const tx = db.transaction([CONVERSATIONS_STORE, MESSAGES_STORE], 'readwrite');
    tx.objectStore(CONVERSATIONS_STORE).clear();
    tx.objectStore(MESSAGES_STORE).clear();
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('messageCache.clearAll', e);
  }
}

export async function deleteConversation(conversationId: string) {
  try {
    await withStore(CONVERSATIONS_STORE, 'readwrite', store => {
      store.delete(conversationId);
      return Promise.resolve(true);
    });
  } catch (e) {
    console.error('messageCache.deleteConversation conversation error', e);
  }

  try {
    await withStore(MESSAGES_STORE, 'readwrite', store => {
      return new Promise<void>((resolve) => {
        const index = store.index('byConversation');
        const range = IDBKeyRange.only(conversationId);
        const req = index.openCursor(range);
        req.onsuccess = (ev) => {
          const cursor = (ev.target as IDBRequest).result as IDBCursorWithValue | null;
          if (!cursor) return resolve();
          try {
            cursor.delete();
          } catch (err) {
            console.debug('messageCache.deleteConversation item skip', err);
          }
          cursor.continue();
        };
        req.onerror = () => resolve();
      });
    });
  } catch (e) {
    console.error('messageCache.deleteConversation messages error', e);
  }
}

// Simple eviction: keep max messages per conversation
export async function enforceEviction(maxPerConversation = 1000) {
  try {
    const db = await openDB();
    const tx = db.transaction([MESSAGES_STORE], 'readwrite');
    const store = tx.objectStore(MESSAGES_STORE);
    const idx = store.index('byConversation');
    const conversations: Record<string, number> = {};
    return new Promise<void>((resolve) => {
      const req = idx.openCursor();
      req.onsuccess = (ev) => {
        const cur = (ev.target as IDBRequest).result as IDBCursorWithValue | null;
        if (!cur) return resolve();
        const rec = cur.value;
        const cid = rec.conversationId;
        conversations[cid] = (conversations[cid] || 0) + 1;
        if (conversations[cid] > maxPerConversation) {
          cur.delete();
        }
        cur.continue();
      };
      req.onerror = () => resolve();
    });
  } catch (e) {
    console.error('messageCache.enforceEviction', e);
  }
}

export default {
  saveConversation,
  getAllConversations,
  saveMessages,
  getMessagesForConversation,
  getLatestMessageTimestamp,
  clearAll,
  enforceEviction,
  deleteConversation
};
