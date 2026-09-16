'use client'

import {
  LayoutGrid,
  Library,
  Maximize2,
  Menu,
  Minimize2,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Sun,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { blocksFromLines, makeBlock } from '@/lib/blocks'
import { newId } from '@/lib/id'
import { allDocs, allDocsRaw, allProjects, deleteFile, loadDoc, saveDoc, saveProject } from '@/lib/store'
import { getSupabase, isSyncConfigured } from '@/lib/supabase'
import { pushAll, runSync, type SyncState } from '@/lib/sync'
import { docsInProject, makeProject, shouldDissolve } from '@/lib/projects'
import type { Grouping } from '@/lib/library'
import { attachmentRefs, purge, restore, shouldPurge, trashedDocs } from '@/lib/trash'
import { isTextish, type Doc, type Project } from '@/lib/types'
import { SIDEBAR, THEME, WIDTH, usePref } from '@/lib/ui-prefs'
import AccountButton, { type Account } from './account'
import DocList from './doc-list'
import DocMenu from './doc-menu'
import HomeScreen from './home-screen'
import ProjectBar from './project-bar'
import Editor from './editor'
import LibraryPanel, { type Incoming } from './library-panel'
import SearchPanel from './search-panel'

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
  /** The Library: the way documents come in, and the one list of all of them. */
  const [library, setLibrary] = useState(false)
  /**
   * The home screen, filling the window.
   *
   * Closed on first load, deliberately. Opening straight into a document with
   * the caret already in it is this app's oldest promise, and a home screen in
   * front of that is one press between somebody and their first sentence.
   */
  const [home, setHome] = useState(false)
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
    if (made.length) setDoc(made[0])
    setDrawer(false)
  }

  const openDoc = async (id: string) => {
    await flushSave()
    const found = (await loadDoc(id)) ?? docs.find((d) => d.id === id) ?? null
    if (found) setDoc(found)
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
      {/* Backdrop for the sidebar on small screens. */}
      {drawer && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setDrawer(false)}
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
        />
      )}

      {/*
        One element serves as a drawer on a phone and a collapsible column on a
        desktop. Collapsed, it is removed from the layout entirely rather than
        merely hidden, so the document gets the full width of the window back —
        which is the point of collapsing it.

        What is in it is deliberately short: New, Search, Library, and three
        lists — this folder, favourites, recent. Everything that used to be
        here as well is still in the app, on the home screen or in the Library.
      */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-paper)] transition-transform md:static ${
          drawer ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarOpen ? 'md:translate-x-0' : 'md:hidden'}`}
      >
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          {/* The mark is the way to the home screen, as it is in most things
              with a home screen. */}
          <button
            type="button"
            onClick={() => {
              void flushSave()
              setHome(true)
              setDrawer(false)
            }}
            aria-label="Home"
            title="Home"
            className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-[var(--color-hover)]"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--color-accent)] text-[12px] font-bold text-white">
              P
            </span>
            <span className="text-[15px] font-semibold">Pad</span>
          </button>
          <button
            type="button"
            onClick={() => setDrawer(false)}
            aria-label="Close menu"
            className="ml-auto p-1 text-[var(--color-muted)] md:hidden"
          >
            <X size={16} />
          </button>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Collapse sidebar"
            title="Collapse sidebar (Ctrl+\)"
            className="ml-auto hidden rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-hover)] md:block"
          >
            <PanelLeft size={16} />
          </button>
        </div>

        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={() => newDoc()}
            className="flex w-full items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 py-2 text-[14px] font-medium text-white hover:opacity-90"
          >
            <Plus size={15} /> New
          </button>
        </div>

        {/*
          A button rather than a text box. Typing here used to filter the list
          of names, which is a different and much weaker thing than searching
          what is inside the documents — and two searches that behave
          differently is worse than one that works.
        */}
        <div className="px-2 pb-1">
          <button
            type="button"
            onClick={() => {
              setSearching(true)
              setDrawer(false)
            }}
            className="flex w-full items-center gap-2 rounded-md bg-[var(--color-hover)] px-2.5 py-1.5 text-[14px] text-[var(--color-faint)] hover:text-[var(--color-muted)]"
          >
            <Search size={15} />
            Search
            <kbd className="ml-auto hidden text-[12px] md:inline">Ctrl K</kbd>
          </button>
          {/*
            The Library is both the way documents come in and the one place
            every document is listed — which is why the sidebar can afford to
            show only a handful.
          */}
          <button
            type="button"
            onClick={() => {
              setLibrary(true)
              setDrawer(false)
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <Library size={15} />
            Library
          </button>
        </div>

        <DocList
          docs={docs}
          projects={projects}
          currentId={doc?.id ?? null}
          currentProject={openProject}
          onOpen={(id) => void openDoc(id)}
          onDelete={(id) => void deleteDoc(id)}
          onFavorite={(id, favorite) => void setFavorite(id, favorite)}
          onMove={(docId, projectId) => void moveDoc(docId, projectId)}
          onNewProject={(id) => void newProjectWith(id)}
        />

        <div className="flex items-center gap-1 border-t border-[var(--color-line)] px-2 py-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          {/*
            The page is a fixed measure by default now, because a line that
            runs the whole width of a large monitor is genuinely hard to read.
            Wide is still one click away for anyone who wants it.
          */}
          <button
            type="button"
            onClick={() => setWidthPref(wide ? 'narrow' : 'wide')}
            title={wide ? 'Narrow the page for easier reading' : 'Use the full width'}
            className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            {wide ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {wide ? 'Narrow' : 'Wide'}
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {/*
          Sticky as well as outside the scroller. On a desktop the layout
          already holds it still, but a phone's address bar resizes the visual
          viewport and can scroll an ancestor, taking the header with it.
        */}
        <header className="sticky top-0 z-30 flex shrink-0 items-center gap-1.5 border-b border-[var(--color-line)] bg-[var(--color-paper)]/95 px-3 py-2 backdrop-blur">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-hover)] md:hidden"
          >
            <Menu size={18} />
          </button>
          {/* The way back once the sidebar is collapsed. Without it, collapsing
              is a one-way door for anyone who does not know the shortcut. */}
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
              setHome(true)
            }}
            aria-label="Home"
            title="Home"
            className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <LayoutGrid size={18} />
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSearching(true)}
              aria-label="Search"
              title="Search (Ctrl+K)"
              className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              <Search size={18} />
            </button>
            {doc && (
              <DocMenu
                doc={doc}
                importing={importing}
                accountId={account?.id ?? null}
                onImportPdf={(file) => void importPdf(file, file.name)}
                onImportWord={(file) => void importWord(file)}
              />
            )}
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

        <div className="pad-desk min-h-0 flex-1 overflow-y-auto">
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
            {ready && doc && openProject && (
              <ProjectBar
                project={openProject}
                docs={projectDocs}
                currentId={doc.id}
                onOpen={(id) => void openDoc(id)}
                onNew={() => newDoc(openProject.id)}
                onRename={(name) =>
                  putProject({ ...openProject, name, updatedAt: Date.now() })
                }
              />
            )}
            {/*
              Nothing is rendered until the store has answered. A placeholder
              document painted first would be replaced a frame later, and the
              flicker reads as the app losing the user's work.
            */}
            {ready && doc && (
              <div className="pad-page flex-1 overflow-hidden sm:rounded-lg">
                <Editor
                  key={doc.id}
                  doc={doc}
                  onChange={update}
                  onExtractPdf={(file, name) => void importPdf(file, name)}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      <HomeScreen
        open={home}
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
        onLibrary={() => setLibrary(true)}
        onFavorite={(id, favorite) => void setFavorite(id, favorite)}
        onRestore={(id) => void restoreDoc(id)}
        onPurge={(id) => void purgeDoc(id)}
        onEmptyTrash={() => void emptyTrash()}
      />

      <LibraryPanel
        open={library}
        onClose={() => setLibrary(false)}
        docs={docs}
        onOpen={(id) => {
          void openDoc(id)
          setHome(false)
        }}
        onAdd={(items, groups, withSummaries) => void addFromLibrary(items, groups, withSummaries)}
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
