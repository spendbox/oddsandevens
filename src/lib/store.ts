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

import type { Doc, Project } from './types'

const DB_NAME = 'pad'
const DB_VERSION = 4
const DOCS = 'docs'
/** Ids of documents changed since the last successful push to the server. */
const OUTBOX = 'outbox'
/** Attached file bytes, keyed by the `ref` on a file block. */
const FILES = 'files'
/** Projects, which group documents. */
const PROJECTS = 'projects'
/** Ids of projects changed since the last successful push. */
const PROJECT_OUTBOX = 'projectOutbox'
/** Small values that are neither documents nor projects — sync cursors. */
const META = 'meta'

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
        if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES)
        // Guarded by `contains` rather than by version number, so a browser
        // upgrading from any earlier version lands in the same shape.
        if (!db.objectStoreNames.contains(PROJECTS)) {
          db.createObjectStore(PROJECTS, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(PROJECT_OUTBOX)) {
          db.createObjectStore(PROJECT_OUTBOX)
        }
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
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
const projectMemory = new Map<string, Project>()
const metaMemory = new Map<string, unknown>()

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

/* ------------------------------------------------------------------ projects */

export async function saveProject(project: Project): Promise<void> {
  projectMemory.set(project.id, project)
  await run(PROJECTS, 'readwrite', (s) => s.put(project))
  await run(PROJECT_OUTBOX, 'readwrite', (s) => s.put(project.updatedAt, project.id))
}

export async function allProjects(): Promise<Project[]> {
  const stored = await run<Project[]>(PROJECTS, 'readonly', (s) => s.getAll())
  return (stored ?? [...projectMemory.values()]).filter((p) => !p.deletedAt)
}

/** Every project including tombstones, which sync needs. */
export async function allProjectsRaw(): Promise<Project[]> {
  const stored = await run<Project[]>(PROJECTS, 'readonly', (s) => s.getAll())
  return stored ?? [...projectMemory.values()]
}

export async function pendingProjectIds(): Promise<string[]> {
  const keys = await run<IDBValidKey[]>(PROJECT_OUTBOX, 'readonly', (s) => s.getAllKeys())
  return (keys ?? []).map(String)
}

export async function clearPendingProject(id: string): Promise<void> {
  await run(PROJECT_OUTBOX, 'readwrite', (s) => s.delete(id))
}

export async function loadProject(id: string): Promise<Project | null> {
  const stored = await run<Project>(PROJECTS, 'readonly', (s) => s.get(id))
  return stored ?? projectMemory.get(id) ?? null
}

/** Accepts a project from the server without marking it as owed back. */
export async function acceptProjectFromServer(project: Project): Promise<void> {
  projectMemory.set(project.id, project)
  await run(PROJECTS, 'readwrite', (s) => s.put(project))
}

/**
 * Attachments. Blobs go in their own store rather than onto the document,
 * which is what keeps a document's JSON small enough to sync on every change.
 * IndexedDB stores a Blob directly — no base64, so no 33% size penalty and no
 * megabyte-long string to serialise.
 */
export async function saveFile(ref: string, blob: Blob): Promise<boolean> {
  const result = await run(FILES, 'readwrite', (s) => s.put(blob, ref))
  // A null result means the transaction failed, most often because the
  // browser's storage quota is full. The caller needs to know, or the block
  // would be added pointing at bytes that were never written.
  return result !== null
}

export async function loadFile(ref: string): Promise<Blob | null> {
  return (await run<Blob>(FILES, 'readonly', (s) => s.get(ref))) ?? null
}

export async function deleteFile(ref: string): Promise<void> {
  await run(FILES, 'readwrite', (s) => s.delete(ref))
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

/**
 * Everything on this device, forgotten.
 *
 * Every store, including the sync cursors — especially the sync cursors. A
 * cursor is "the newest row this device has accepted", and one left behind
 * from another account is a timestamp that would make the next pull skip
 * every row older than it. The new account would sign in to a device that
 * quietly refuses to download most of their notes.
 *
 * The in-memory fallbacks go with them, because they are the store on a
 * browser where IndexedDB is unavailable and leaving them would mean the
 * previous account's notes surviving a hand-over in exactly the case where
 * nothing else did.
 */
export async function clearAll(): Promise<void> {
  memory.clear()
  projectMemory.clear()
  metaMemory.clear()
  for (const name of [DOCS, OUTBOX, FILES, PROJECTS, PROJECT_OUTBOX, META]) {
    await run(name, 'readwrite', (s) => s.clear())
  }
}

/**
 * Small bookkeeping values, kept beside the data they describe.
 *
 * Sync cursors live here rather than in localStorage: they belong to the same
 * database as the documents they are a position within, so clearing one and
 * keeping the other cannot happen. A missing value is always safe — it means a
 * full reconcile next time, which is slower and never wrong.
 */
export async function saveMeta(key: string, value: unknown): Promise<void> {
  metaMemory.set(key, value)
  await run(META, 'readwrite', (s) => s.put(value, key))
}

export async function loadMeta<T>(key: string): Promise<T | null> {
  const stored = await run<T>(META, 'readonly', (s) => s.get(key) as IDBRequest<T>)
  return stored ?? ((metaMemory.get(key) as T | undefined) ?? null)
}
