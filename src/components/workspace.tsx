'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { blocksFromPasted, makeBlock } from '@/lib/blocks'
import { titleFrom, withoutTitleLine } from '@/lib/compose'
import { newId } from '@/lib/id'
import type { PastedBlock } from '@/lib/paste'
import { allDocs, allDocsRaw, loadDoc, saveDoc } from '@/lib/store'
import { getSupabase, isSyncConfigured } from '@/lib/supabase'
import { pushAll, runSync, type SyncState } from '@/lib/sync'
import {
  emptyHistory,
  record,
  redo,
  undo,
  type History,
} from '@/lib/history'
import { purge, restore, shouldPurge, trashedDocs } from '@/lib/trash'
import { blockText, type Block, type Doc } from '@/lib/types'
import { type Account } from './account'
import ComposeNote from './compose-note'
import Editor from './editor'
import NotesScreen, { type NotesTab } from './notes-screen'
import SearchPanel from './search-panel'

/**
 * The whole application: a list of notes, and a note.
 *
 * ## Two screens, and nothing around them
 *
 * There was a sidebar, a Library, a home screen with tabs, a folder bar, a
 * settings column, a formatting toolbar and an action panel. What people
 * actually do is write a note and later find it again — so what is left is the
 * list and the note, plus search, which is how finding actually works once
 * there are more than twenty of anything.
 *
 * The list is the front page. Opening straight into the last note touched was
 * this app's oldest habit, and it was opening a filing cabinet at whichever
 * drawer somebody left out.
 *
 * ## What still has to be true
 *
 * Nothing waits for the network. IndexedDB is the store; the server is a copy
 * that lets a second device catch up, and it may fail freely. A save that
 * waits on a server is a bug.
 */

/** How long after the last keystroke a note is written to disk. */
const SAVE_DEBOUNCE_MS = 400
/** How often to reconcile with the server while signed in. */
const SYNC_EVERY_MS = 20_000

function emptyDoc(): Doc {
  const now = Date.now()
  return { id: newId(), title: '', blocks: [makeBlock('text')], createdAt: now, updatedAt: now }
}

export default function Workspace() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [trashed, setTrashed] = useState<Doc[]>([])
  /** The note being written, or null when the list is on screen. */
  const [doc, setDoc] = useState<Doc | null>(null)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<NotesTab>('notes')
  const [searching, setSearching] = useState(false)
  const [composing, setComposing] = useState(false)
  /**
   * Whether writing help is available at all.
   *
   * The key lives on the server, so the browser cannot see it; the route says
   * yes or no once, here, and everything that offers it is told. Asked in one
   * place rather than by each panel, because three components asking the same
   * question on mount is three requests for one answer that cannot change
   * while the tab is open.
   */
  const [aiReady, setAiReady] = useState(false)
  /** Whether the last keystrokes are still on their way to the disk. */
  const [saving, setSaving] = useState(false)
  /**
   * Undo and redo for the open note.
   *
   * Held here rather than in the editor because it has to survive everything
   * that changes a note from outside the writing surface — a dictation, a
   * rewrite — and because it must be thrown away when a different note is
   * opened. See lib/history.ts.
   */
  const [history, setHistory] = useState<History>(emptyHistory)
  /** Bumped when an undo puts an older note back, so the page repaints. */
  const [undoRevision, setUndoRevision] = useState(0)
  const [account, setAccount] = useState<Account | null>(null)
  const [syncState, setSyncState] = useState<SyncState>(isSyncConfigured() ? 'idle' : 'off')

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * The newest note, readable from a callback that was created earlier.
   *
   * Mirrored in one effect rather than assigned from each action, because the
   * React Compiler forbids mutating a ref inside a memoised callback — and
   * because one place to keep it in step beats six places to forget.
   */
  const latest = useRef<Doc | null>(null)
  useEffect(() => {
    latest.current = doc
  }, [doc])

  /* ---------------------------------------------------------------- start up */

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [stored, raw] = await Promise.all([allDocs(), allDocsRaw()])
      if (cancelled) return

      // The seven-day sweep runs on open rather than on a timer: there is no
      // server here to run a nightly job, and a note that expired while the
      // app was closed should be gone by the time anyone looks.
      const expired = raw.filter((d) => shouldPurge(d))
      if (expired.length) {
        for (const doomed of expired) await saveDoc(purge(doomed))
      }
      setTrashed(trashedDocs(expired.length ? await allDocsRaw() : raw))
      setDocs(stored)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Whether writing help is configured, asked once for the whole app.
  useEffect(() => {
    let cancelled = false
    void fetch('/api/ai')
      .then((response) => response.json() as Promise<{ configured?: boolean }>)
      .then((data) => {
        if (!cancelled) setAiReady(!!data.configured)
      })
      .catch(() => {
        // No answer means no writing help offered, which is the same as no
        // key: a button that appears and then fails is worse than none.
      })
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
    // The bar says "Saving…" from the keystroke until the disk has it. It is
    // the only thing this app says about saving, and it has to be true.
    setSaving(true)
    // The state being replaced is what undo comes back to. `latest` is kept in
    // step with `doc` by the effect above, so it is the previous note by the
    // time any user action gets here.
    const before = latest.current
    if (before && before.id === next.id) {
      setHistory((current) => record(current, before, next))
    }
    setDoc(next)
    setDocs((all) => {
      const without = all.filter((d) => d.id !== next.id)
      return [next, ...without].sort((a, b) => b.updatedAt - a.updatedAt)
    })
    if (saveTimer.current) clearTimeout(saveTimer.current)
    /*
      The timer saves the note it was scheduled for, captured here.

      It used to read "whichever note is current" when it fired, which silently
      lost work: type a title, leave for another note inside the debounce
      window, and 400ms later the timer wrote the note you had gone *to*.
    */
    saveTimer.current = setTimeout(() => {
      void saveDoc(next).then(() => setSaving(false))
    }, SAVE_DEBOUNCE_MS)
  }, [])

  /**
   * Writes the open note now and cancels any pending debounce.
   *
   * Used before anything that reads the store back — leaving a note, deleting
   * one — because a pending timer plus a fresh read is a race that hands back
   * the version from before the last keystroke.
   */
  const flushSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    if (latest.current) await saveDoc(latest.current)
    setSaving(false)
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

  /**
   * Puts an older — or a newer — version of the open note back.
   *
   * Written through the same path as an ordinary edit so it is saved, listed
   * and synced identically; the only difference is that the history is moved
   * rather than added to, and the revision is bumped so a focused paragraph
   * repaints.
   */
  const step = useCallback(
    (direction: 'undo' | 'redo') => {
      const current = latest.current
      if (!current) return
      const moved = direction === 'undo' ? undo(history, current) : redo(history, current)
      if (!moved) return
      setHistory(moved.history)
      setUndoRevision((r) => r + 1)
      const restored = { ...moved.doc, updatedAt: Date.now() }
      setDoc(restored)
      setDocs((all) =>
        [restored, ...all.filter((d) => d.id !== restored.id)].sort(
          (a, b) => b.updatedAt - a.updatedAt,
        ),
      )
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = null
      void saveDoc(restored)
    },
    [history],
  )

  const undoEdit = useCallback(() => step('undo'), [step])
  const redoEdit = useCallback(() => step('redo'), [step])

  /* -------------------------------------------------------------------- sync */

  const refreshFromStore = useCallback(async () => {
    const [stored, raw] = await Promise.all([allDocs(), allDocsRaw()])
    setDocs(stored)
    setTrashed(trashedDocs(raw))
    // Re-read the open note in case the server had a newer copy, but never
    // yank it out from under the caret if it is gone.
    const current = latest.current
    if (current) {
      const fresher = stored.find((d) => d.id === current.id)
      if (fresher && fresher.updatedAt > current.updatedAt) setDoc(fresher)
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

  /*
    Ctrl+K opens search, the shortcut every app of this shape uses. It is never
    the only way in: the field across the top of the notes says what it
    searches, which a shortcut cannot.
  */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearching(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  /* ------------------------------------------------------------------- notes */

  const openDoc = useCallback(
    async (id: string) => {
      await flushSave()
      const found = (await loadDoc(id)) ?? docs.find((d) => d.id === id) ?? null
      if (found) setDoc(found)
      // A different note is a different history. Carrying it across would mean
      // Ctrl+Z in one note restoring a state of another.
      setHistory(emptyHistory())
    },
    [docs, flushSave],
  )

  const closeDoc = useCallback(async () => {
    await flushSave()
    setDoc(null)
    setHistory(emptyHistory())
  }, [flushSave])

  /** A note that arrived whole: composed in the box, or spoken into the mic. */
  const addNote = useCallback(
    async (note: { title: string; blocks: Block[] }) => {
      await flushSave()
      const fresh = emptyDoc()
      fresh.title = note.title
      // Never demand a name: when nothing has given the note one, it is made
      // from the opening line.
      if (!fresh.title.trim()) {
        fresh.title = titleFrom(note.blocks.map(blockText).filter(Boolean).join('\n'))
      }
      /*
        And the line a name was taken from is not left in the writing as well.

        Always, not only when the name was worked out here: the box names a
        note too, and when there is no key it names it from the first line in
        exactly the same way. `withoutTitleLine` only takes a line that really
        does start with the name, so a name the model wrote — which is a
        summary rather than a prefix — leaves the writing untouched.
      */
      const blocks = withoutTitleLine(note.blocks, fresh.title)
      fresh.blocks = blocks.length ? blocks : [makeBlock('text')]
      setDocs((all) => [fresh, ...all])
      setHistory(emptyHistory())
      await saveDoc(fresh)
      return fresh
    },
    [flushSave],
  )

  const deleteDoc = useCallback(
    async (id: string) => {
      // To the trash, not gone: a tombstone, which also tells a second device
      // about the delete instead of letting it upload its copy back.
      const target = docs.find((d) => d.id === id)
      if (target) {
        const binned = { ...target, deletedAt: Date.now(), updatedAt: Date.now() }
        await saveDoc(binned)
        setTrashed((all) => [binned, ...all.filter((d) => d.id !== id)])
      }
      setDocs((all) => all.filter((d) => d.id !== id))
      if (latest.current?.id === id) {
        setDoc(null)
        setHistory(emptyHistory())
      }
    },
    [docs],
  )

  const restoreDoc = useCallback(async (id: string) => {
    const target = (await loadDoc(id)) ?? null
    if (!target) return
    const back = restore(target)
    await saveDoc(back)
    setTrashed((all) => all.filter((d) => d.id !== id))
    setDocs((all) =>
      [back, ...all.filter((d) => d.id !== id)].sort((a, b) => b.updatedAt - a.updatedAt),
    )
  }, [])

  /**
   * Destroys one note for good.
   *
   * The row stays, emptied: a tombstone costs a few dozen bytes, and removing
   * it entirely would let another device that still has its copy push it
   * straight back on the next sync.
   */
  const purgeDoc = useCallback(async (id: string) => {
    const target = (await loadDoc(id)) ?? null
    if (!target) return
    await saveDoc(purge(target))
    setTrashed((all) => all.filter((d) => d.id !== id))
  }, [])

  const emptyTrash = useCallback(async () => {
    for (const item of await allDocsRaw()) {
      if (!item.deletedAt || item.purgedAt) continue
      await saveDoc(purge(item))
    }
    setTrashed([])
  }, [])

  const setFavorite = useCallback(
    async (docId: string, favorite: boolean) => {
      const source = (await loadDoc(docId)) ?? docs.find((d) => d.id === docId)
      if (!source) return
      const next: Doc = { ...source, updatedAt: Date.now() }
      if (favorite) next.favoritedAt = Date.now()
      else delete next.favoritedAt
      await saveDoc(next)
      setDocs((all) => all.map((d) => (d.id === docId ? next : d)))
      if (latest.current?.id === docId) setDoc(next)
    },
    [docs],
  )

  /** Speech from the notes screen, which becomes a note of its own. */
  const recordNote = useCallback(
    (blocks: PastedBlock[]) => {
      if (!blocks.length) return
      void addNote({ title: '', blocks: blocksFromPasted(blocks) }).then((fresh) => setDoc(fresh))
    },
    [addNote],
  )

  /* ------------------------------------------------------------------ render */

  /*
    Nothing is rendered until the store has answered. A placeholder painted
    first would be replaced a frame later, and the flicker reads as the app
    losing the user's work.
  */
  if (!ready) return <div className="min-h-dvh bg-[var(--color-paper)]" />

  return (
    <>
      {doc ? (
        <div className="pad-desk min-h-dvh">
          {/*
            The note is a sheet of paper on a desk, at a reading measure: a
            line that runs the width of a large monitor is measurably harder to
            read, and there is no longer a control for widening it because
            nobody ever wanted one badly enough to go looking.
          */}
          <div className="mx-auto w-full max-w-[52rem] sm:px-6 sm:py-6">
            <div className="pad-page min-h-dvh sm:min-h-0 sm:rounded-lg">
              <Editor
                key={doc.id}
                doc={doc}
                onChange={update}
                onUndo={undoEdit}
                onRedo={redoEdit}
                externalRevision={undoRevision}
                aiReady={aiReady}
                accountId={account?.id ?? null}
                saving={saving}
                covered={searching}
                onBack={() => void closeDoc()}
                onFavorite={(favorite) => void setFavorite(doc.id, favorite)}
                onDelete={() => void deleteDoc(doc.id)}
              />
            </div>
          </div>
        </div>
      ) : (
        <NotesScreen
          docs={docs}
          trashed={trashed}
          tab={tab}
          onTab={setTab}
          onOpen={(id) => void openDoc(id)}
          onCompose={() => setComposing(true)}
          onSearch={() => setSearching(true)}
          onFavorite={(id, favorite) => void setFavorite(id, favorite)}
          onDelete={(id) => void deleteDoc(id)}
          onRestore={(id) => void restoreDoc(id)}
          onPurge={(id) => void purgeDoc(id)}
          onEmptyTrash={() => void emptyTrash()}
          onRecord={recordNote}
          aiReady={aiReady}
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
      )}

      {/*
        The box that makes a note. It stays closed until somebody presses
        "Write a note", and what it saves lands in the list rather than opening
        — the point of dashing a note off is that you get to go back to what
        you were doing.
      */}
      <ComposeNote
        open={composing}
        aiReady={aiReady}
        onClose={() => setComposing(false)}
        onSave={(note) => void addNote(note)}
      />

      <SearchPanel
        open={searching}
        docs={docs}
        onClose={() => setSearching(false)}
        onOpen={(id) => void openDoc(id)}
      />
    </>
  )
}
