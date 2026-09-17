'use client'

import { House, Menu, PanelLeft, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { blocksFromLines, makeBlock } from '@/lib/blocks'
import { newId } from '@/lib/id'
import { allDocs, allDocsRaw, allProjects, deleteFile, loadDoc, saveDoc, saveProject } from '@/lib/store'
import { getSupabase, isSyncConfigured } from '@/lib/supabase'
import { pushAll, runSync, type SyncState } from '@/lib/sync'
import {
  canRedo as hasRedo,
  canUndo as hasUndo,
  emptyHistory,
  record,
  redo,
  undo,
  type History,
} from '@/lib/history'
import { docsInProject, makeProject, mergedProjectName, shouldDissolve } from '@/lib/projects'
import type { Grouping } from '@/lib/library'
import { attachmentRefs, purge, restore, shouldPurge, trashedDocs } from '@/lib/trash'
import { isTextish, type Doc, type Project } from '@/lib/types'
import { SIDEBAR, THEME, WIDTH, usePref } from '@/lib/ui-prefs'
import AccountButton, { type Account } from './account'
import FolderBar from './folder-bar'
import HomeScreen, { type HomeTab } from './home-screen'
import Editor from './editor'
import type { Incoming } from './library-view'
import SearchPanel from './search-panel'
import SideMenu from './side-menu'

/** How long after the last keystroke a document is written to disk. */
const SAVE_DEBOUNCE_MS = 400
/**
 * Where the header folds away, and where it comes back.
 *
 * Two thresholds rather than one, and decided by *where* the page is rather
 * than by which way it was last moving. Direction is the obvious way to write
 * this and it oscillates: folding the header makes the scroller 52 pixels
 * taller, that relayout fires another scroll event, and the handler reads the
 * change it caused itself as a fresh scroll in the other direction. The gap
 * between these two numbers is wider than the header is tall, so nothing the
 * fold does to the layout can carry the page across both of them.
 */
const HEADER_FOLDS_BELOW = 140
const HEADER_RETURNS_ABOVE = 60
/** How often to reconcile with the server while signed in. */
const SYNC_EVERY_MS = 20_000

function emptyDoc(): Doc {
  const now = Date.now()
  return { id: newId(), title: '', blocks: [makeBlock('text')], createdAt: now, updatedAt: now }
}

export default function Workspace() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [trashed, setTrashed] = useState<Doc[]>([])
  const [doc, setDoc] = useState<Doc | null>(null)
  const [ready, setReady] = useState(false)
  /** The sidebar as a drawer on a phone. Separate from the desktop pref:
   *  a narrow screen has no room to keep it open alongside the document. */
  const [drawer, setDrawer] = useState(false)
  /** The search panel, which looks inside every document rather than
   *  filtering the list of their names. */
  const [searching, setSearching] = useState(false)
  /**
   * The home screen, filling the window.
   *
   * Closed on first load, deliberately. Opening straight into a document with
   * the caret already in it is this app's oldest promise, and a home screen in
   * front of that is one press between somebody and their first sentence.
   *
   * The Library is one of its two tabs rather than a dialog of its own. "What
   * was I doing" and "what do I have" are two questions about one collection,
   * and answering them in two full-screen surfaces stacked on each other is
   * how somebody ends up two Escapes away from their own sentence.
   */
  const [home, setHome] = useState(false)
  const [homeTab, setHomeTab] = useState<HomeTab>('carry')
  /**
   * Whether writing help is available at all.
   *
   * The key lives on the server, so the browser cannot see it; the route says
   * yes or no once, here, and everything that offers an assistant is told.
   * Asked in one place rather than by each panel that wants to know, because
   * three components asking the same question on mount is three requests for
   * one answer that cannot change while the tab is open.
   */
  const [aiReady, setAiReady] = useState(false)
  /**
   * A press of the action button in the side menu.
   *
   * The plan is painted over the editing surface, which is what holds the
   * document; the side menu only asks for it. A counter rather than a boolean,
   * so pressing it twice in a row opens it twice, and the editor reads the
   * number changing rather than having to be told to clear a flag.
   */
  const [command, setCommand] = useState<{ kind: 'plan'; n: number } | null>(null)
  /**
   * Whether the app header has folded away.
   *
   * Two bars stacked at the top of a phone — the application's, then the
   * document's — is a third of the screen gone before a word of the document.
   * Scrolling down folds the header away and leaves the toolbar, which is
   * sticky inside the scroller and so lands at the very top; scrolling up
   * brings it straight back, which is the behaviour every reading app on a
   * phone already has.
   */
  const [condensed, setCondensed] = useState(false)
  /**
   * Undo and redo for the open document.
   *
   * Held here rather than in the editor because it has to survive everything
   * that changes a document from outside the editing surface — an import, a
   * batch from the Library, a rewrite from the assistant — and because it must
   * be thrown away when a different document is opened. See lib/history.ts.
   */
  const [history, setHistory] = useState<History>(emptyHistory)
  /**
   * Bumped whenever an older document is put back.
   *
   * Editable refuses to repaint a focused element unless the revision says so,
   * which is what stops the caret jumping while typing — and which would
   * otherwise leave the undone text on screen when somebody undoes an edit in
   * the paragraph they are still in.
   */
  const [undoRevision, setUndoRevision] = useState(0)
  const [account, setAccount] = useState<Account | null>(null)
  const [syncState, setSyncState] = useState<SyncState>(isSyncConfigured() ? 'idle' : 'off')
  const [importing, setImporting] = useState(false)
  const [importProblem, setImportProblem] = useState<string | null>(null)
  const { value: theme, set: setTheme } = usePref(THEME)
  const { value: sidebarPref, set: setSidebarPref } = usePref(SIDEBAR)
  const { value: widthPref, set: setWidthPref } = usePref(WIDTH)

  // Open and wide unless the reader has said otherwise.
  const sidebarOpen = sidebarPref !== 'closed'
  const wide = widthPref !== 'narrow'

  const toggleTheme = () => {
    const current =
      theme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    setTheme(current === 'dark' ? 'light' : 'dark')
  }
  const toggleSidebar = () => setSidebarPref(sidebarOpen ? 'closed' : 'open')

  /**
   * The newest document, readable from a callback that was created earlier.
   *
   * The debounced save fires 400ms after a keystroke and must write what is
   * current *then*, not what was current when the timer was armed. Mirrored
   * from state in one effect rather than assigned from each action, because
   * the React Compiler forbids mutating a ref inside a memoised callback —
   * and because six assignment sites are six chances for one to be forgotten.
   */
  const latest = useRef<Doc | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    latest.current = doc
  }, [doc])

  /*
    A different document starts at the top, so the header comes back with it.

    Adjusted during render rather than in an effect — the pattern this codebase
    uses for "a value changed, so this state is stale" — because in an effect
    the new document paints once with the header still folded away, which looks
    like the application has lost its chrome.
  */
  const [lastDocId, setLastDocId] = useState<string | null>(null)
  if (doc && doc.id !== lastDocId) {
    setLastDocId(doc.id)
    if (condensed) setCondensed(false)
  }

  /* ---------------------------------------------------------------- start up */

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [stored, storedProjects, raw] = await Promise.all([
        allDocs(),
        allProjects(),
        allDocsRaw(),
      ])
      if (cancelled) return
      setProjects(storedProjects)

      // The seven-day sweep runs on open rather than on a timer: there is no
      // server here to run a nightly job, and a document that expired while
      // the app was closed should be gone by the time anyone looks.
      const expired = raw.filter((d) => shouldPurge(d))
      if (expired.length) {
        for (const doomed of expired) {
          for (const ref of attachmentRefs(doomed)) await deleteFile(ref)
          await saveDoc(purge(doomed))
        }
      }
      setTrashed(trashedDocs(expired.length ? await allDocsRaw() : raw))
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
    // The state being replaced is what undo comes back to. `latest` is kept in
    // step with `doc` by the effect above, so it is the previous document by
    // the time any user action gets here.
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
    // The timer saves the document it was scheduled for, captured here.
    //
    // It used to read "whichever document is current" when it fired, which
    // silently lost work: type a title, switch documents inside the debounce
    // window, and 400ms later the timer wrote the document you had switched
    // *to*, leaving the edit unsaved. Anything typed in the last 400ms before
    // changing documents simply disappeared.
    saveTimer.current = setTimeout(() => void saveDoc(next), SAVE_DEBOUNCE_MS)
  }, [])

  // A debounce means up to SAVE_DEBOUNCE_MS of typing is only in memory. If
  // the tab is closed or hidden in that window it would be lost, so both
  // events flush immediately. pagehide covers mobile Safari, where
  // beforeunload is not reliably delivered.
  /**
   * Writes the open document now and cancels any pending debounce.
   *
   * Used before anything that reads the store back — switching documents,
   * deleting one — because a pending timer plus a fresh read is a race that
   * hands back the version from before the last keystroke.
   */
  const flushSave = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    if (latest.current) await saveDoc(latest.current)
  }, [])

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
   * Puts an older — or a newer — version of the open document back.
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
    const [stored, storedProjects, raw] = await Promise.all([
      allDocs(),
      allProjects(),
      allDocsRaw(),
    ])
    setDocs(stored)
    setProjects(storedProjects)
    setTrashed(trashedDocs(raw))
    // Re-read the open document in case the server had a newer copy, but
    // never yank it out from under the caret if it is gone.
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

  // Cmd/Ctrl+\ collapses the sidebar, the shortcut every editor uses for it.
  // Cmd/Ctrl+K opens search, likewise.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearching(true)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        event.preventDefault()
        setSidebarPref(
          document.documentElement.getAttribute('data-sidebar') === 'closed' ? 'open' : 'closed',
        )
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [setSidebarPref])

  /**
   * Reads a PDF's text and appends it as editable blocks.
   *
   * It appends rather than replaces: an import that wiped what was already on
   * the page would be a destructive act triggered by one menu click.
   */
  const importPdf = useCallback(
    async (file: Blob, name: string) => {
      setImporting(true)
      setImportProblem(null)
      try {
        const { extractPdfText } = await import('@/lib/pdf')
        const { pages, pageCount } = await extractPdfText(file)
        const lines = pages.flatMap((page, i) => (i === 0 ? page : ['', ...page]))
        const words = lines.join(' ').trim()

        if (!words) {
          setImportProblem(
            `“${name}” has no text to pull out. It is probably a scan or a photograph of a page, which would need character recognition.`,
          )
          return
        }

        const current = latest.current
        if (!current) return
        const heading = makeBlock('heading', 2)
        if (heading.type === 'heading') heading.text = name.replace(/\.pdf$/i, '')
        const existing = current.blocks.filter(
          (b) => !(b.type === 'text' && !b.text.trim()),
        )
        update({
          ...current,
          blocks: [...existing, heading, ...blocksFromLines(lines)],
          updatedAt: Date.now(),
        })
        setImportProblem(
          pageCount > 0 ? null : 'That PDF appears to be empty.',
        )
      } catch {
        setImportProblem(
          `Could not read “${name}”. It may be password protected or damaged.`,
        )
      } finally {
        setImporting(false)
      }
    },
    [update],
  )

  /**
   * Reads a Word document and appends it as editable blocks.
   *
   * Appends rather than replaces, for the same reason as the PDF import: one
   * menu click should not be able to wipe the page.
   */
  const importWord = useCallback(
    async (file: File) => {
      setImporting(true)
      setImportProblem(null)
      try {
        const { docxToBlocks } = await import('@/lib/docx')
        const pasted = await docxToBlocks(file)
        if (!pasted.length) {
          setImportProblem(`There was no text to read in “${file.name}”.`)
          return
        }
        const current = latest.current
        if (!current) return
        const existing = current.blocks.filter((b) => !(b.type === 'text' && !b.text.trim()))
        const created = pasted.map((item) => {
          const made = makeBlock(item.type, item.level)
          // Checked by type, not with `in`: an optional property that has
          // never been set is absent from the object, so `'html' in made` was
          // false on every fresh block and all the formatting was dropped.
          if (isTextish(made) || made.type === 'todo') {
            made.text = item.text
            made.html = item.html
            made.indent = item.indent
          }
          if (made.type === 'code') made.code = item.text
          return made
        })
        update({ ...current, blocks: [...existing, ...created], updatedAt: Date.now() })
      } catch (error) {
        setImportProblem(
          error instanceof Error
            ? `Could not open “${file.name}”. ${error.message}`
            : `Could not open “${file.name}”.`,
        )
      } finally {
        setImporting(false)
      }
    },
    [update],
  )

  /* ------------------------------------------------------------------- trash */

  const restoreDoc = useCallback(async (id: string) => {
    const target = (await loadDoc(id)) ?? null
    if (!target) return
    const back = restore(target)
    await saveDoc(back)
    setTrashed((all) => all.filter((d) => d.id !== id))
    setDocs((all) => [back, ...all.filter((d) => d.id !== id)].sort((a, b) => b.updatedAt - a.updatedAt))
  }, [])

  /** Destroys one document for good, and the attachments only it was holding. */
  const purgeDoc = useCallback(async (id: string) => {
    const target = (await loadDoc(id)) ?? null
    if (!target) return
    for (const ref of attachmentRefs(target)) await deleteFile(ref)
    await saveDoc(purge(target))
    setTrashed((all) => all.filter((d) => d.id !== id))
  }, [])

  const emptyTrash = useCallback(async () => {
    for (const item of await allDocsRaw()) {
      if (!item.deletedAt || item.purgedAt) continue
      for (const ref of attachmentRefs(item)) await deleteFile(ref)
      await saveDoc(purge(item))
    }
    setTrashed([])
  }, [])

  /* ---------------------------------------------------------------- projects */

  /** Writes a project locally and queues it for the next sync. */
  const putProject = useCallback((project: Project) => {
    setProjects((all) => {
      const without = all.filter((p) => p.id !== project.id)
      return project.deletedAt ? without : [project, ...without]
    })
    void saveProject(project)
  }, [])

  /** Writes a document's project membership without touching its content. */
  const setDocProject = useCallback(
    async (docId: string, projectId: string | null) => {
      const source = (await loadDoc(docId)) ?? docs.find((d) => d.id === docId)
      if (!source) return
      const next: Doc = { ...source, updatedAt: Date.now() }
      if (projectId) next.projectId = projectId
      else delete next.projectId
      await saveDoc(next)
      setDocs((all) => all.map((d) => (d.id === docId ? next : d)))
      // The open document has to be replaced too, or the bar above it keeps
      // showing the project it was just moved out of.
      if (doc?.id === docId) setDoc(next)
      return next
    },
    [docs, doc?.id],
  )

  /**
   * Stars or unstars a document.
   *
   * One optional field on the document itself, exactly like its project, so it
   * travels on the next sync with no new table, no second list to disagree
   * with this one, and nothing to migrate for documents written before
   * favourites existed.
   */
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

  /** Puts one document into a new project of its own, from the row menu. */
  const newProjectWith = useCallback(
    async (docId: string) => {
      const source = docs.find((d) => d.id === docId)
      if (!source) return
      const project = makeProject(source.title.trim() || 'New project')
      putProject(project)
      await setDocProject(docId, project.id)
    },
    [docs, putProject, setDocProject],
  )

  /**
   * Dropping one document onto another: a folder holding both.
   *
   * Back after being taken out with the sidebar tree, because it is the
   * gesture that matches what it does — putting two pieces of paper in one
   * folder — and because the row menu, which replaced it, is three presses for
   * something that was one movement.
   */
  const mergeDocs = useCallback(
    async (draggedId: string, targetId: string) => {
      const dragged = docs.find((d) => d.id === draggedId)
      const target = docs.find((d) => d.id === targetId)
      if (!dragged || !target) return
      const project = makeProject(mergedProjectName(target, dragged))
      putProject(project)
      await setDocProject(targetId, project.id)
      await setDocProject(draggedId, project.id)
    },
    [docs, putProject, setDocProject],
  )

  /**
   * Several documents into one new folder, from a selection in the Library.
   *
   * Named after the first of them, like every other new folder, because a
   * folder made from a selection has no better name available and "New
   * folder" tells the reader nothing at all.
   */
  const groupDocsTogether = useCallback(
    async (docIds: string[]) => {
      const chosen = docIds
        .map((id) => docs.find((doc) => doc.id === id))
        .filter((doc): doc is Doc => !!doc)
      if (chosen.length < 2) {
        if (chosen[0]) await newProjectWith(chosen[0].id)
        return
      }
      const project = makeProject(chosen[0].title.trim() || 'New project')
      putProject(project)
      for (const item of chosen) await setDocProject(item.id, project.id)
    },
    [docs, newProjectWith, putProject, setDocProject],
  )

  /**
   * Moving a document in or out of a project.
   *
   * A project left with one document dissolves: a folder holding a single item
   * is a document with an extra click in front of it, and dissolving means
   * dragging the second one out simply undoes the merge.
   */
  const moveDoc = useCallback(
    async (docId: string, projectId: string | null) => {
      const before = docs.find((d) => d.id === docId)?.projectId ?? null
      if (before === projectId) return
      await setDocProject(docId, projectId)
      if (!before) return
      const left = docsInProject(docs, before).filter((d) => d.id !== docId)
      if (shouldDissolve(left.length)) {
        for (const orphan of left) await setDocProject(orphan.id, null)
        const project = projects.find((p) => p.id === before)
        if (project) putProject({ ...project, deletedAt: Date.now(), updatedAt: Date.now() })
      }
    },
    [docs, projects, putProject, setDocProject],
  )

  /* ------------------------------------------------------------------ actions */

  const newDoc = (projectId?: string) => {
    // Whatever is open keeps its last keystrokes rather than losing them to
    // the debounce window.
    void flushSave()
    const fresh = emptyDoc()
    // A document created from inside a project belongs to it immediately;
    // making it loose and asking the user to drag it in would undo the point
    // of being in the project when they pressed the button.
    if (projectId) fresh.projectId = projectId
    setDocs((all) => [fresh, ...all])
    setHistory(emptyHistory())
    setDoc(fresh)
    void saveDoc(fresh)
    setDrawer(false)
  }

  /**
   * Takes a reviewed batch from the Library.
   *
   * Everything it makes is an ordinary document in the ordinary list: there is
   * no library store, no second shape and no separate place to look. The
   * grouping is applied as projects, which is the axis that already exists for
   * this, and only where the review offered one.
   */
  const addFromLibrary = async (items: Incoming[], groups: Grouping[], withSummaries: boolean) => {
    await flushSave()
    const now = Date.now()

    // Projects first, so no document is saved naming one that does not exist
    // yet — the same order sync uses, and for the same reason.
    const projectFor = new Map<string, string>()
    for (const group of groups) {
      if (!group.name || group.members.length < 2) continue
      const project = makeProject(group.name)
      putProject(project)
      for (const member of group.members) {
        const item = items[member]
        if (item) projectFor.set(item.id, project.id)
      }
    }

    const made: Doc[] = items.map((item, i) => {
      const blocks = [...item.blocks]
      // The summary goes in as a quote at the top: something to read before
      // deciding to open it, and one more thing for search to find.
      if (withSummaries && item.summary) {
        const note = makeBlock('quote')
        if (note.type === 'quote') note.text = item.summary
        blocks.unshift(note)
      }
      const doc: Doc = {
        id: newId(),
        title: item.title.trim(),
        blocks: blocks.length ? blocks : [makeBlock('text')],
        // Spaced by a millisecond so the list keeps the order they were
        // reviewed in rather than an arbitrary one.
        createdAt: now + i,
        updatedAt: now + i,
      }
      const projectId = projectFor.get(item.id)
      if (projectId) doc.projectId = projectId
      return doc
    })

    for (const doc of made) await saveDoc(doc)
    setDocs((all) => [...made].reverse().concat(all))
    setHistory(emptyHistory())
    if (made.length) setDoc(made[0])
    setDrawer(false)
  }

  const openDoc = async (id: string) => {
    await flushSave()
    const found = (await loadDoc(id)) ?? docs.find((d) => d.id === id) ?? null
    if (found) setDoc(found)
    // A different document is a different history. Carrying it across would
    // mean Ctrl+Z in one document restoring a state of another one.
    setHistory(emptyHistory())
    setDrawer(false)
  }

  const deleteDoc = async (id: string) => {
    // To the trash, not gone: a tombstone, which also tells a second device
    // about the delete instead of letting it upload its copy back.
    const target = docs.find((d) => d.id === id)
    if (target) {
      const binned = { ...target, deletedAt: Date.now(), updatedAt: Date.now() }
      await saveDoc(binned)
      setTrashed((all) => [binned, ...all.filter((d) => d.id !== id)])
    }
    const remaining = docs.filter((d) => d.id !== id)
    setDocs(remaining)
    if (doc?.id === id) {
      if (remaining.length) {
        setDoc(remaining[0])
      } else {
        newDoc()
      }
    }
  }

  /**
   * The project the open document belongs to, and everything else in it.
   *
   * Both are null for an ungrouped document, which is what keeps the bar off
   * the screen entirely rather than showing an empty one.
   */
  const openProject = useMemo(
    () => (doc?.projectId ? (projects.find((p) => p.id === doc.projectId) ?? null) : null),
    [doc, projects],
  )
  const projectDocs = useMemo(
    () => (openProject ? docsInProject(docs, openProject.id) : []),
    [docs, openProject],
  )

  /* ------------------------------------------------------------------ render */

  return (
    <div className="pad-desk flex h-dvh overflow-hidden">
      {/*
        One element serves as a drawer on a phone and a collapsible column on a
        desktop. Collapsed, it is removed from the layout entirely rather than
        merely hidden, so the document gets the full width of the window back —
        which is the point of collapsing it.

        What is in it is deliberately short: three ways out, one way onward,
        and then the open document and everything about it. See side-menu.tsx.
      */}
      <aside
        // Full width on a phone. A 16rem drawer over a 390px screen left a
        // strip of the document showing down one side, which reads as
        // something half-open rather than as a place you have gone to; and it
        // cost every row in it the width that made the names readable.
        className={`fixed inset-y-0 left-0 z-40 flex w-full shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-paper)] transition-transform md:static md:w-72 ${
          drawer ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarOpen ? 'md:translate-x-0' : 'md:hidden'}`}
      >
        <SideMenu
          doc={ready ? doc : null}
          project={openProject}
          folderDocs={projectDocs}
          projects={projects}
          onHome={() => {
            void flushSave()
            setHomeTab('carry')
            setHome(true)
            setDrawer(false)
          }}
          onLibrary={() => {
            void flushSave()
            setHomeTab('library')
            setHome(true)
            setDrawer(false)
          }}
          onSearch={() => {
            setSearching(true)
            setDrawer(false)
          }}
          onNew={() => newDoc()}
          onOpen={(id) => void openDoc(id)}
          onCarryOn={() => setDrawer(false)}
          onClose={() => setDrawer(false)}
          onCollapse={toggleSidebar}
          theme={theme}
          onTheme={toggleTheme}
          wide={wide}
          onWide={() => setWidthPref(wide ? 'narrow' : 'wide')}
          settings={{
            onMove: (projectId) => doc && void moveDoc(doc.id, projectId),
            onNewFolder: () => doc && void newProjectWith(doc.id),
            onDelete: () => doc && void deleteDoc(doc.id),
            onImportPdf: (file) => void importPdf(file, file.name),
            onImportWord: (file) => void importWord(file),
            importing,
            accountId: account?.id ?? null,
            onPlan: () => {
              setDrawer(false)
              setCommand((current) => ({ kind: 'plan', n: (current?.n ?? 0) + 1 }))
            },
          }}
        />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {/*
          Folded away by not being rendered, not by a height of zero with the
          overflow hidden.

          The height-and-clip version animated nicely and clipped every menu
          opened from inside the header — the folder menu came out cropped to
          the height of the header, which reads as the menu being behind the
          page. A menu that cannot escape its bar is worse than a fold that
          does not animate.
        */}
        {!condensed && (
          <header className="sticky top-0 z-30 flex h-[3.25rem] shrink-0 items-center gap-1.5 border-b border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2">
            <button
              type="button"
              onClick={() => setDrawer(true)}
              aria-label="Open menu"
              className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-hover)] md:hidden"
            >
              <Menu size={18} />
            </button>
            {/* The way back once the sidebar is collapsed. Without it,
                collapsing is a one-way door for anyone who does not know the
                shortcut. */}
            {!sidebarOpen && (
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Show sidebar"
                title="Show sidebar (Ctrl+\)"
                className="hidden rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-hover)] md:block"
              >
                <PanelLeft size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                void flushSave()
                setHomeTab('carry')
                setHome(true)
              }}
              aria-label="Home"
              title="Home"
              className="shrink-0 rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              <House size={18} />
            </button>
            {ready && doc && openProject && (
              <FolderBar
                project={openProject}
                docs={projectDocs}
                currentId={doc.id}
                projects={projects}
                onOpen={(id) => void openDoc(id)}
                onNew={() => newDoc(openProject.id)}
                onRename={(name) => putProject({ ...openProject, name, updatedAt: Date.now() })}
                onMove={(projectId) => void moveDoc(doc.id, projectId)}
                onNewFolder={() => void newProjectWith(doc.id)}
              />
            )}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setSearching(true)}
                aria-label="Search"
                title="Search (Ctrl+K)"
                className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
              >
                <Search size={18} />
              </button>
              <AccountButton
                account={account}
                syncState={syncState}
                onSignedIn={(next) => {
                  setAccount(next)
                  // Everything written before signing in belongs to this
                  // account now; without this first push it would stay on one
                  // device.
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
        )}

        <div
          className="pad-desk min-h-0 flex-1 overflow-y-auto"
          onScroll={(event) => {
            // Between the two thresholds nothing changes, which is what makes
            // the fold stable. See the note on the constants.
            const top = event.currentTarget.scrollTop
            if (top <= HEADER_RETURNS_ABOVE) setCondensed(false)
            else if (top >= HEADER_FOLDS_BELOW) setCondensed(true)
          }}
        >
          {/*
            The document is a sheet of paper on a desk. Narrow is a reading
            measure and is the default, because a line of text that runs the
            width of a large monitor is measurably harder to read; wide gives
            the sheet the whole window for anyone who prefers it.
          */}
          <div
            // A flex column at least as tall as the window, so the sheet below
            // reaches the bottom of the screen instead of stopping wherever
            // the text happens to end and leaving the desk showing under a
            // half-written page.
            className={`flex min-h-full w-full flex-col px-0 pb-0 sm:px-6 sm:pt-6 sm:pb-8 ${
              wide ? 'max-w-[110rem]' : 'mx-auto max-w-[56rem]'
            }`}
          >
            {importProblem && (
              <p
                role="status"
                className="mx-3 mb-3 rounded-md border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-2 text-[14px] text-[var(--color-muted)] sm:mx-0"
              >
                {importProblem}
              </p>
            )}
            {/*
              Nothing is rendered until the store has answered. A placeholder
              document painted first would be replaced a frame later, and the
              flicker reads as the app losing the user's work.

              No `overflow-hidden` on the sheet below: it rounded the corners
              neatly and quietly broke `position: sticky` for everything inside
              it, because an ancestor that clips its overflow becomes the
              scrollport a sticky element sticks within, and a box that does
              not scroll cannot make anything stick.
            */}
            {ready && doc && (
              <div className="pad-page flex-1 sm:rounded-lg">
                <Editor
                  key={doc.id}
                  doc={doc}
                  onChange={update}
                  onExtractPdf={(file, name) => void importPdf(file, name)}
                  onUndo={undoEdit}
                  onRedo={redoEdit}
                  canUndo={hasUndo(history)}
                  canRedo={hasRedo(history)}
                  externalRevision={undoRevision}
                  command={command}
                  aiReady={aiReady}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      <HomeScreen
        open={home}
        tab={homeTab}
        onTab={setHomeTab}
        onClose={() => setHome(false)}
        docs={docs}
        projects={projects}
        current={doc}
        currentProject={openProject}
        trashed={trashed}
        onOpen={(id) => {
          void openDoc(id)
          setHome(false)
        }}
        onNew={() => {
          newDoc()
          setHome(false)
        }}
        onSearch={() => setSearching(true)}
        onFavorite={(id, favorite) => void setFavorite(id, favorite)}
        onRestore={(id) => void restoreDoc(id)}
        onPurge={(id) => void purgeDoc(id)}
        onEmptyTrash={() => void emptyTrash()}
        onMove={(docId, projectId) => void moveDoc(docId, projectId)}
        onNewFolder={(docId) => void newProjectWith(docId)}
        onGroup={(docIds) => void groupDocsTogether(docIds)}
        onMerge={(draggedId, targetId) => void mergeDocs(draggedId, targetId)}
        onDelete={(docId) => void deleteDoc(docId)}
        onAdd={(items, groups, withSummaries) => {
          // The batch opens the first of them, so this screen gets out of the
          // way — the same as opening any other document from here.
          void addFromLibrary(items, groups, withSummaries)
          setHome(false)
        }}
        aiReady={aiReady}
      />

      <SearchPanel
        open={searching}
        docs={docs}
        projects={projects}
        onClose={() => setSearching(false)}
        onOpen={(id) => {
          void openDoc(id)
          setHome(false)
        }}
      />
    </div>
  )
}
