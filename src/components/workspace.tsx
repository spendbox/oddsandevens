'use client'

import { FileText, Menu, Moon, Plus, Search, Sun, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { docPreview, makeBlock } from '@/lib/blocks'
import { newId } from '@/lib/id'
import { allDocs, loadDoc, saveDoc } from '@/lib/store'
import { getSupabase, isSyncConfigured } from '@/lib/supabase'
import { pushAll, runSync, type SyncState } from '@/lib/sync'
import { blockText, type Doc } from '@/lib/types'
import { useTheme } from '@/lib/use-theme'
import AccountButton, { type Account } from './account'
import Editor from './editor'

/** How long after the last keystroke a document is written to disk. */
const SAVE_DEBOUNCE_MS = 400
/** How often to reconcile with the server while signed in. */
const SYNC_EVERY_MS = 20_000

function emptyDoc(): Doc {
  const now = Date.now()
  return { id: newId(), title: '', blocks: [makeBlock('text')], createdAt: now, updatedAt: now }
}

export default function Workspace() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [doc, setDoc] = useState<Doc | null>(null)
  const [ready, setReady] = useState(false)
  const [sidebar, setSidebar] = useState(false)
  const [query, setQuery] = useState('')
  const [account, setAccount] = useState<Account | null>(null)
  const [syncState, setSyncState] = useState<SyncState>(isSyncConfigured() ? 'idle' : 'off')
  const { theme, toggle: toggleTheme } = useTheme()

  // Holds the newest document between renders so the debounced save always
  // writes the latest text rather than whatever was current when it was armed.
  const latest = useRef<Doc | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ---------------------------------------------------------------- start up */

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const stored = await allDocs()
      if (cancelled) return
      if (stored.length) {
        setDocs(stored)
        setDoc(stored[0])
      } else {
        // First visit: a document is already open and waiting for a keystroke.
        // Nobody should have to press New before they can type.
        const fresh = emptyDoc()
        setDocs([fresh])
        setDoc(fresh)
        void saveDoc(fresh)
      }
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // The service worker is what makes the installed app open with no network.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {})
    // Registering after load keeps it off the path of the first paint.
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  /* ------------------------------------------------------------------ saving */

  const update = useCallback((next: Doc) => {
    setDoc(next)
    latest.current = next
    setDocs((all) => {
      const without = all.filter((d) => d.id !== next.id)
      return [next, ...without].sort((a, b) => b.updatedAt - a.updatedAt)
    })
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (latest.current) void saveDoc(latest.current)
    }, SAVE_DEBOUNCE_MS)
  }, [])

  // A debounce means up to SAVE_DEBOUNCE_MS of typing is only in memory. If
  // the tab is closed or hidden in that window it would be lost, so both
  // events flush immediately. pagehide covers mobile Safari, where
  // beforeunload is not reliably delivered.
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (latest.current) void saveDoc(latest.current)
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHidden)
      flush()
    }
  }, [])

  /* -------------------------------------------------------------------- sync */

  const refreshFromStore = useCallback(async () => {
    const stored = await allDocs()
    setDocs(stored)
    // Re-read the open document in case the server had a newer copy, but
    // never yank it out from under the caret if it is gone.
    const current = latest.current
    if (current) {
      const fresher = stored.find((d) => d.id === current.id)
      if (fresher && fresher.updatedAt > current.updatedAt) {
        setDoc(fresher)
        latest.current = fresher
      }
    }
  }, [])

  const sync = useCallback(
    async (userId: string) => {
      setSyncState('syncing')
      const { ok, changed } = await runSync(userId)
      setSyncState(ok ? 'idle' : 'error')
      if (changed) await refreshFromStore()
    },
    [refreshFromStore],
  )

  // Restore an existing session on load, so a signed-in user is not asked again.
  useEffect(() => {
    if (!isSyncConfigured()) return
    void (async () => {
      const db = await getSupabase()
      if (!db) return
      const { data } = await db.auth.getSession()
      const user = data.session?.user
      if (!user) return
      const found = { id: user.id, email: user.email ?? '' }
      setAccount(found)
      void sync(found.id)
    })()
  }, [sync])

  useEffect(() => {
    if (!account) return
    const id = setInterval(() => void sync(account.id), SYNC_EVERY_MS)
    // Coming back to the tab is the moment another device's changes matter.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync(account.id)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [account, sync])

  /* ------------------------------------------------------------------ actions */

  const newDoc = () => {
    const fresh = emptyDoc()
    setDocs((all) => [fresh, ...all])
    setDoc(fresh)
    latest.current = fresh
    void saveDoc(fresh)
    setSidebar(false)
  }

  const openDoc = async (id: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (latest.current) await saveDoc(latest.current)
    const found = (await loadDoc(id)) ?? docs.find((d) => d.id === id) ?? null
    if (found) {
      setDoc(found)
      latest.current = found
    }
    setSidebar(false)
  }

  const deleteDoc = async (id: string) => {
    // A tombstone rather than a removal, so a second device learns about the
    // delete instead of uploading its copy back.
    const target = docs.find((d) => d.id === id)
    if (target) await saveDoc({ ...target, deletedAt: Date.now(), updatedAt: Date.now() })
    const remaining = docs.filter((d) => d.id !== id)
    setDocs(remaining)
    if (doc?.id === id) {
      if (remaining.length) {
        setDoc(remaining[0])
        latest.current = remaining[0]
      } else {
        newDoc()
      }
    }
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return docs
    return docs.filter((d) => {
      if (d.title.toLowerCase().includes(q)) return true
      return d.blocks.some((b) => blockText(b).toLowerCase().includes(q))
    })
  }, [docs, query])

  /* ------------------------------------------------------------------ render */

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Backdrop for the sidebar on small screens. */}
      {sidebar && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setSidebar(false)}
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-paper)] transition-transform md:static md:translate-x-0 ${
          sidebar ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-accent)] text-[11px] font-bold text-white">
            I
          </span>
          <span className="text-sm font-semibold">Pad</span>
          <button
            type="button"
            onClick={() => setSidebar(false)}
            aria-label="Close menu"
            className="ml-auto p-1 text-[var(--color-muted)] md:hidden"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={newDoc}
            className="flex w-full items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            <Plus size={13} /> New
          </button>
        </div>

        <div className="relative px-2 pb-2">
          <Search
            size={13}
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[var(--color-faint)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search documents"
            className="w-full rounded-md bg-[var(--color-hover)] py-1.5 pr-2 pl-7 text-xs outline-none placeholder:text-[var(--color-faint)]"
          />
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {results.length === 0 && (
            <p className="px-2 py-3 text-[11px] text-[var(--color-faint)]">
              {query ? 'Nothing found' : 'No documents yet'}
            </p>
          )}
          {results.map((item) => (
            <div
              key={item.id}
              className={`group/doc flex items-center gap-1 rounded-md ${
                doc?.id === item.id ? 'bg-[var(--color-accent-soft)]' : 'hover:bg-[var(--color-hover)]'
              }`}
            >
              <button
                type="button"
                onClick={() => void openDoc(item.id)}
                className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left"
              >
                <FileText size={13} className="mt-0.5 shrink-0 text-[var(--color-faint)]" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">
                    {item.title.trim() || 'Untitled'}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--color-faint)]">
                    {docPreview(item.blocks)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete ${item.title.trim() || 'Untitled'}`}
                onClick={() => void deleteDoc(item.id)}
                className="mr-1 p-1 text-[var(--color-faint)] opacity-0 transition-opacity group-hover/doc:opacity-100 focus:opacity-100 hover:text-[var(--color-danger)]"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--color-line)] px-2 py-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => setSidebar(true)}
            aria-label="Open menu"
            className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-hover)] md:hidden"
          >
            <Menu size={17} />
          </button>
          <div className="ml-auto">
            <AccountButton
              account={account}
              syncState={syncState}
              onSignedIn={(next) => {
                setAccount(next)
                // Everything written before signing in belongs to this account
                // now; without this first push it would stay on one device.
                void pushAll(next.id).then(() => sync(next.id))
              }}
              onSignedOut={() => {
                setAccount(null)
                setSyncState('idle')
              }}
              onSyncNow={() => account && void sync(account.id)}
            />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-8">
            {/*
              Nothing is rendered until the store has answered. A placeholder
              document painted first would be replaced a frame later, and the
              flicker reads as the app losing the user's work.
            */}
            {ready && doc && <Editor key={doc.id} doc={doc} onChange={update} />}
          </div>
        </div>
      </main>
    </div>
  )
}
