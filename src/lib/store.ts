/**
 * Local storage of documents, in IndexedDB.
 *
 * This is the primary store, not a cache. The app is usable with no account
 * and no network: open it, type, close the tab, come back, the work is there.
 * Signing in adds sync on top (see sync.ts) but never becomes the place the
 * data lives — a save must never wait on a server that may be unreachable.
 *
 * localStorage is deliberately not used. It is synchronous, so writing a long
 * document on it blocks the main thread mid-keystroke, and it caps out around
 * 5MB, which one pasted spreadsheet can reach.
 */

import type { Doc } from './types'

const DB_NAME = 'pad'
const DB_VERSION = 1
const DOCS = 'docs'
/** Ids of documents changed since the last successful push to the server. */
const OUTBOX = 'outbox'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    // Private windows, blocked site data and some embedded browsers throw here
    // or never fire an event. A failure downgrades the app to in-memory for
    // the session rather than showing the user an error they cannot act on.
    if (typeof indexedDB === 'undefined') return resolve(null)
    let settled = false
    const done = (value: IDBDatabase | null) => {
      if (!settled) {
        settled = true
        resolve(value)
      }
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS, { keyPath: 'id' })
        if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX)
      }
      request.onsuccess = () => done(request.result)
      request.onerror = () => done(null)
      request.onblocked = () => done(null)
      // Safari in a private window can leave the request hanging with no event.
      setTimeout(() => done(null), 3000)
    } catch {
      done(null)
    }
  })
  return dbPromise
}

/** Used only when IndexedDB is unavailable, so the session still works. */
const memory = new Map<string, Doc>()

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null)
        try {
          const tx = db.transaction(store, mode)
          const request = fn(tx.objectStore(store))
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

export async function saveDoc(doc: Doc): Promise<void> {
  memory.set(doc.id, doc)
  await run(DOCS, 'readwrite', (s) => s.put(doc))
  await run(OUTBOX, 'readwrite', (s) => s.put(doc.updatedAt, doc.id))
}

export async function loadDoc(id: string): Promise<Doc | null> {
  const stored = await run<Doc>(DOCS, 'readonly', (s) => s.get(id))
  return stored ?? memory.get(id) ?? null
}

export async function allDocs(): Promise<Doc[]> {
  const stored = await run<Doc[]>(DOCS, 'readonly', (s) => s.getAll())
  const docs = stored ?? [...memory.values()]
  return docs
    .filter((doc) => !doc.deletedAt)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Every document including deleted ones, which sync needs to carry tombstones. */
export async function allDocsRaw(): Promise<Doc[]> {
  const stored = await run<Doc[]>(DOCS, 'readonly', (s) => s.getAll())
  return stored ?? [...memory.values()]
}

export async function pendingIds(): Promise<string[]> {
  const keys = await run<IDBValidKey[]>(OUTBOX, 'readonly', (s) => s.getAllKeys())
  return (keys ?? []).map(String)
}

export async function clearPending(id: string): Promise<void> {
  await run(OUTBOX, 'readwrite', (s) => s.delete(id))
}

/**
 * Writes a document that arrived from the server. It does not touch the
 * outbox: a change we were just handed is not a change we owe back, and
 * marking it pending would bounce it to the server forever.
 */
export async function acceptFromServer(doc: Doc): Promise<void> {
  memory.set(doc.id, doc)
  await run(DOCS, 'readwrite', (s) => s.put(doc))
}
