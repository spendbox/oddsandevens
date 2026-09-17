'use client'

import {
  Check,
  CheckSquare,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  FileText,
  FolderInput,
  FolderOpen,
  GripVertical,
  LoaderCircle,
  Search,
  Sparkles,
  Square,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { docLabel, docPreview, makeBlock } from '@/lib/blocks'
import { useFolds } from '@/lib/folds'
import {
  groupByTopic,
  localSummary,
  localTitle,
  parseFiling,
  topicWords,
  type Grouping,
} from '@/lib/library'
import { newId } from '@/lib/id'
import { readFileIntoBlocks } from '@/lib/read-file'
import { groupDocs } from '@/lib/projects'
import { buildIndex, search, type SearchHit } from '@/lib/search'
import { saveFile } from '@/lib/store'
import { blockText, type Block, type Doc, type Project } from '@/lib/types'
import DocIcon from './doc-icon'
import FolderPicker from './folder-picker'
import Snippet from './snippet'

/**
 * The Library: drop a pile of documents in, get them back filed.
 *
 * The pile is the problem. A folder of `scan_0012.pdf`, `Document (3).docx`
 * and `IMG_20240211.pdf` is unreadable not because the documents are bad but
 * because nothing in the list says what any of them is, and renaming forty
 * files by hand is an hour nobody spends.
 *
 * So each file is read, titled from its contents rather than its name, given
 * a sentence saying what it covers, and the ones that turn out to be about the
 * same thing are offered as a project. Nothing is added until it has been
 * seen: every title is editable in the review list, and the whole batch can be
 * thrown away with one button.
 *
 * It is not a separate place for documents to live. What comes out the other
 * side is ordinary documents in the ordinary lists, searchable and answerable
 * like everything else — the library is a way in, not a container.
 *
 * ## Why it also lists everything
 *
 * It used to be a drop zone and nothing else: you could put documents in and
 * then never see them here again, which made "Library" a strange name for a
 * one-way door. So the whole collection is listed underneath, searchable,
 * newest first. That is not a second store — these are the same documents
 * everything else shows, read from the same place — it is the one screen where
 * all of them are visible at once, which is precisely what the side menu
 * stopped trying to be.
 *
 * ## Why the search is the app's search
 *
 * Because there is only one. A box that filters filenames and a box that
 * searches inside documents behave differently and teach people to distrust
 * both; this uses `lib/search.ts`, the same BM25 index as the search panel,
 * so a word remembered from the middle of a page finds it here too.
 *
 * ## Why the list is grouped by folder, and search is not
 *
 * Browsing and searching are different questions. Browsing is "where did I put
 * the tenancy things", which is a question about folders, so the list is
 * grouped under them — with the unfiled documents FIRST, because those are the
 * ones the answer is "nowhere yet" for and they are exactly what somebody came
 * here to deal with. Searching is "which document says Bourdillon", and the
 * answer to that is an ordered list of matches; folder headings between them
 * would only push the best match further down the page.
 *
 * ## Why there are two ways to move documents
 *
 * Dragging one row onto another makes a folder of the pair, because that is
 * the gesture that matches what it does — two pieces of paper into one folder
 * — and it is a mouse gesture. Selecting a few and pressing Move is the same
 * thought with a thumb, and it is the only one of the two that can move nine
 * documents at once.
 */

export interface Incoming {
  id: string
  /** The filename it arrived with. */
  name: string
  blocks: Block[]
  title: string
  summary: string
  topic: string
  /** Set when the file could not be read at all. */
  problem?: string
}

export interface LibraryViewProps {
  /** Everything already in the collection, newest first. */
  docs: Doc[]
  /** The folders those documents are grouped under. */
  projects: Project[]
  /** Opens one of them, which closes whatever this is inside. */
  onOpen: (id: string) => void
  /** Moves a document to a folder, or out of every folder with null. */
  onMove: (docId: string, projectId: string | null) => void
  /** Makes a new folder named after that document and puts it inside. */
  onNewFolder: (docId: string) => void
  /** Puts several documents into one new folder together. */
  onGroup: (docIds: string[]) => void
  /** Dropping one document onto another: a folder holding both. */
  onMerge: (draggedId: string, targetId: string) => void
  onFavorite: (docId: string, favorite: boolean) => void
  onDelete: (docId: string) => void
  /** Adds the finished documents, grouping them as the review showed. */
  onAdd: (items: Incoming[], groups: Grouping[], withSummaries: boolean) => void
  /**
   * Whether the model can improve the titles. False costs quality, never the
   * import: every title and summary is worked out on this device first.
   */
  aiReady: boolean
}

/** How much of a document the model is shown in order to name it. */
const EXCERPT_CHARS = 1_200
/** Files per batch. A hundred at once is a timeout, not a feature. */
const MAX_FILES = 25
/** How far a pointer must travel before this counts as a drag and not a tap. */
const DRAG_THRESHOLD = 6

interface DragState {
  id: string
  overDoc: string | null
  overFolder: string | null
}

/** The drop target that means "out of every folder". */
const LOOSE = '__loose__'

export default function LibraryView({
  docs,
  projects,
  onOpen,
  onMove,
  onNewFolder,
  onGroup,
  onMerge,
  onFavorite,
  onDelete,
  onAdd,
  aiReady,
}: LibraryViewProps) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Incoming[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [withSummaries, setWithSummaries] = useState(true)
  const [over, setOver] = useState(false)
  /** Which documents are ticked, and whether ticking is on at all. */
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [selecting, setSelecting] = useState(false)
  /** The folder picker, opened for one document or for the whole selection. */
  const [moving, setMoving] = useState<{ ids: string[]; label?: string } | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const { folded, toggle, set: setFolded } = useFolds()

  /*
    Built once for this list of documents, not per keystroke: the index is
    linear in the size of everything ever written, and while this is on screen
    nothing is being edited. The same reasoning, and the same function, as the
    search panel.
  */
  const index = useMemo(() => buildIndex(docs), [docs])
  const hits: SearchHit[] = useMemo(
    () => (query.trim() ? search(index, query, 60) : []),
    [index, query],
  )

  /** The shelf when nothing is being searched for: the loose first, then folders. */
  const shelves = useMemo(() => {
    const grouped = groupDocs(
      docs.filter((doc) => !doc.deletedAt),
      projects,
    )
    const rows: Array<{ id: string | null; name: string; docs: Doc[] }> = []
    // Unfiled first. These are the documents whose answer to "where is it" is
    // "nowhere", which is the question this screen exists to close.
    if (grouped.loose.length) rows.push({ id: null, name: 'Not in a folder', docs: grouped.loose })
    for (const entry of grouped.projects) {
      if (!entry.docs.length) continue
      rows.push({
        id: entry.project.id,
        name: entry.project.name || 'Untitled folder',
        docs: entry.docs,
      })
    }
    return rows
  }, [docs, projects])

  const shelfKeys = shelves.map((shelf) => `lib-${shelf.id ?? 'loose'}`)
  const allFolded = shelfKeys.length > 0 && shelfKeys.every((key) => folded(key))

  /* ------------------------------------------------------------- dragging */

  /*
    Pointer events rather than HTML5 drag-and-drop, because `dragstart` never
    fires on a touch screen. The pointer is captured only once it has actually
    travelled far enough to be a drag — capturing on pointerdown retargets the
    `click` that follows to the capturing element, which silently kills every
    button inside the row.
  */
  const [drag, setDrag] = useState<DragState | null>(null)
  const start = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)

  const beginDrag = (event: React.PointerEvent, id: string) => {
    start.current = { id, x: event.clientX, y: event.clientY, moved: false }
  }

  const moveDrag = (event: React.PointerEvent) => {
    const from = start.current
    if (!from) return
    if (!from.moved) {
      const far =
        Math.abs(event.clientX - from.x) > DRAG_THRESHOLD ||
        Math.abs(event.clientY - from.y) > DRAG_THRESHOLD
      if (!far) return
      from.moved = true
      try {
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      } catch {
        // A pointer already released cannot be captured; the drag then runs on
        // bubbling events instead, which is no worse.
      }
      setDrag({ id: from.id, overDoc: null, overFolder: null })
    }
    const under = document.elementFromPoint(event.clientX, event.clientY)
    const overDoc = under?.closest<HTMLElement>('[data-doc-id]')?.dataset.docId ?? null
    const overFolder = under?.closest<HTMLElement>('[data-folder-id]')?.dataset.folderId ?? null
    setDrag((current) =>
      current
        ? { ...current, overDoc: overDoc && overDoc !== from.id ? overDoc : null, overFolder }
        : current,
    )
  }

  const endDrag = () => {
    const from = start.current
    const state = drag
    start.current = null
    setDrag(null)
    if (from?.moved) {
      justDragged.current = true
      setTimeout(() => {
        justDragged.current = false
      }, 0)
    }
    if (!from?.moved || !state) return

    if (state.overFolder) {
      onMove(state.id, state.overFolder === LOOSE ? null : state.overFolder)
      return
    }
    if (state.overDoc) {
      const target = docs.find((doc) => doc.id === state.overDoc)
      if (!target) return
      // Dropping onto a document already in a folder joins that folder;
      // dropping onto a loose one makes a folder holding both.
      if (target.projectId) onMove(state.id, target.projectId)
      else onMerge(state.id, target.id)
    }
  }

  /** True when this click is the tail of a drag and should be ignored. */
  const fromDrag = () => justDragged.current || !!start.current?.moved

  /* -------------------------------------------------------------- intake */

  /**
   * Reads the files, then asks for better titles.
   *
   * The local titles are produced first and shown either way. The model
   * improves them; it is not what makes them exist, so a missing key or a
   * failed request costs quality and never the import.
   */
  const take = async (files: File[]) => {
    if (!files.length) return
    setProblem(files.length > MAX_FILES ? `Taking the first ${MAX_FILES}.` : null)
    setBusy('reading')

    const read: Incoming[] = []
    for (const file of files.slice(0, MAX_FILES)) {
      try {
        const { blocks, readable } = await readFileIntoBlocks(file)
        if (readable && blocks.length) {
          read.push({
            id: newId(),
            name: file.name,
            blocks,
            title: localTitle(file.name, blocks),
            summary: localSummary(blocks),
            topic: topicWords(blocks.map(blockText).join(' '), 1)[0] ?? '',
          })
          continue
        }
        // Not text: it still belongs in the library, as an attachment with a
        // document around it. The bytes go to the attachment store, never
        // onto the block — a document is synced whole on every change.
        const ref = newId()
        const stored = await saveFile(ref, file)
        const block = makeBlock('file')
        if (block.type === 'file') {
          block.name = file.name
          block.mime = file.type
          block.size = file.size
          block.ref = stored ? ref : ''
        }
        read.push({
          id: newId(),
          name: file.name,
          blocks: [block],
          title: localTitle(file.name, []),
          summary: '',
          topic: '',
          problem: stored ? undefined : 'Too large to keep on this device.',
        })
      } catch (error) {
        read.push({
          id: newId(),
          name: file.name,
          blocks: [],
          title: file.name,
          summary: '',
          topic: '',
          problem: error instanceof Error ? error.message : 'Could not read this file.',
        })
      }
    }

    setItems((current) => [...current, ...read])
    setBusy(null)

    const readable = read.filter((item) => !item.problem && item.blocks.length)
    if (!aiReady || !readable.length) return

    setBusy('filing')
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'file',
          items: readable.map((item, i) => ({
            n: i + 1,
            name: item.name,
            excerpt: item.blocks.map(blockText).filter(Boolean).join('\n').slice(0, EXCERPT_CHARS),
          })),
        }),
      })
      const data = (await response.json()) as { text?: string; error?: string }
      if (!response.ok || !data.text) {
        setProblem(data.error ?? 'Kept the titles worked out on this device.')
        return
      }
      const filed = parseFiling(data.text, readable.length)
      if (!filed.length) return
      setItems((current) =>
        current.map((item) => {
          const at = readable.findIndex((candidate) => candidate.id === item.id)
          const match = at === -1 ? undefined : filed.find((entry) => entry.n === at + 1)
          return match
            ? {
                ...item,
                title: match.title,
                summary: match.summary || item.summary,
                topic: match.topic || item.topic,
              }
            : item
        }),
      )
    } catch {
      setProblem('Kept the titles worked out on this device.')
    } finally {
      setBusy(null)
    }
  }

  /* --------------------------------------------------------------- rows */

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const leaveSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  /**
   * One document on the shelf.
   *
   * Written once and used by both the grouped browse and the flat search
   * results — two copies is two places for one of them to stop offering
   * something the other has.
   */
  const documentRow = (item: Doc, hit?: SearchHit) => {
    const ticked = selected.has(item.id)
    const dragging = drag?.id === item.id
    const isTarget = drag?.overDoc === item.id
    return (
      <li
        key={item.id}
        data-doc-id={item.id}
        className={`group/row relative flex items-center gap-1 rounded-md ${
          dragging ? 'opacity-40' : ''
        } ${
          // A ring rather than a line: the drop makes a container, and a ring
          // is what "these two become one thing" looks like.
          isTarget ? 'ring-2 ring-[var(--color-accent)] ring-inset' : ''
        } ${ticked ? 'bg-[var(--color-accent-soft)]' : ''}`}
        onPointerDown={(event) => {
          // Touch is left to scroll the list; on a touch screen the grip is
          // the way to drag, and selecting does everything a drag does.
          if (event.pointerType === 'touch' || selecting) return
          beginDrag(event, item.id)
        }}
        onPointerMove={selecting ? undefined : moveDrag}
        onPointerUp={selecting ? undefined : endDrag}
        onPointerCancel={() => {
          start.current = null
          setDrag(null)
        }}
      >
        {!selecting && (
          <span
            aria-hidden
            title="Drag onto another document to put them in a folder"
            className="ml-0.5 hidden shrink-0 cursor-grab touch-none text-[var(--color-faint)] opacity-0 group-hover/row:opacity-100 sm:block"
            onPointerDown={(event) => {
              event.stopPropagation()
              beginDrag(event, item.id)
            }}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
          >
            <GripVertical size={12} />
          </span>
        )}
        <button
          type="button"
          aria-pressed={selecting ? ticked : undefined}
          onClick={() => {
            if (fromDrag()) return
            if (selecting) toggleSelected(item.id)
            else onOpen(item.id)
          }}
          className="flex min-w-0 flex-1 items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-[var(--color-hover)]"
        >
          {selecting ? (
            <span className="mt-0.5 shrink-0 text-[var(--color-accent)]">
              {ticked ? <CheckSquare size={16} /> : <Square size={16} className="text-[var(--color-faint)]" />}
            </span>
          ) : (
            <DocIcon doc={item} size={16} className="mt-0.5 shrink-0 text-[var(--color-faint)]" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">{docLabel(item)}</span>
            {/*
              The passage that matched, with the word picked out — the same
              component the search panel uses, because it is the same search.
              Showing the sentence rather than the document's first line is
              what makes it evident this reads inside documents rather than
              filtering a list of names.
            */}
            {hit ? (
              <span className="block text-[13px] leading-snug text-[var(--color-muted)]">
                <Snippet text={hit.snippet} highlights={hit.highlights} />
              </span>
            ) : (
              <span className="block truncate text-[13px] text-[var(--color-muted)]">
                {docPreview(item.blocks)}
              </span>
            )}
          </span>
          <span className="shrink-0 pt-0.5 text-[12px] text-[var(--color-faint)]">
            {new Date(item.updatedAt).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        </button>
        {/*
          Filing is what somebody opens this screen to do, so moving a document
          is one press on the row — and it opens the same picker the side menu
          uses rather than printing every folder into a menu.
        */}
        {!selecting && (
          <button
            type="button"
            aria-label={`Move ${docLabel(item)}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              if (!fromDrag()) setMoving({ ids: [item.id], label: docLabel(item) })
            }}
            className="shrink-0 rounded p-1.5 text-[var(--color-faint)] opacity-60 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:text-[var(--color-ink)] sm:opacity-0"
          >
            <FolderInput size={15} />
          </button>
        )}
      </li>
    )
  }

  const groups = groupByTopic(items.map((item) => item.topic))
  const projectFor = (at: number) =>
    groups.find((group) => group.name && group.members.includes(at))?.name ?? null
  const usable = items.filter((item) => item.blocks.length)
  const chosen = [...selected]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        {/*
          The drop zone is also a button, because dragging is a mouse gesture
          and half the people using this are holding a phone.
        */}
        <button
          type="button"
          onClick={() => picker.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setOver(false)
            void take([...event.dataTransfer.files])
          }}
          className={`flex w-full items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 text-left ${
            over
              ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
              : 'border-[var(--color-line)] hover:bg-[var(--color-hover)]'
          }`}
        >
          <Upload size={17} className="shrink-0 text-[var(--color-faint)]" />
          <span className="min-w-0">
            <span className="block text-[14px] font-medium">
              Drop documents here, or choose files
            </span>
            <span className="block text-[13px] text-[var(--color-faint)]">
              PDF, Word, text and markdown are read into editable text. Anything else is kept as a
              file.
            </span>
          </span>
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          aria-label="Choose documents"
          onChange={(event) => {
            void take([...(event.target.files ?? [])])
            event.target.value = ''
          }}
          className="hidden"
        />

        {busy && (
          <p className="mt-3 flex items-center justify-center gap-2 text-[13px] text-[var(--color-muted)]">
            <LoaderCircle size={13} className="animate-spin" />
            {busy === 'reading' ? 'Reading the documents…' : 'Working out what these are…'}
          </p>
        )}

        {problem && (
          <p
            role="status"
            className="mt-3 rounded-md border border-[var(--color-line)] bg-[var(--color-hover)] px-2.5 py-2 text-[13px] text-[var(--color-muted)]"
          >
            {problem}
          </p>
        )}

        {items.length > 0 && (
          <>
            <p className="mt-4 mb-1.5 flex items-center gap-1.5 text-[13px] text-[var(--color-faint)]">
              {aiReady ? <Sparkles size={12} className="text-[var(--color-accent)]" /> : null}
              {items.length} ready. Every title can be changed before anything is added.
            </p>

            <div className="space-y-1.5">
              {items.map((item, i) => {
                const project = projectFor(i)
                return (
                  <div key={item.id} className="rounded-lg border border-[var(--color-line)] p-2">
                    <div className="flex items-center gap-2">
                      <FileText size={13} className="shrink-0 text-[var(--color-faint)]" />
                      <input
                        value={item.title}
                        aria-label={`Title for ${item.name}`}
                        onChange={(event) =>
                          setItems((current) =>
                            current.map((entry) =>
                              entry.id === item.id
                                ? { ...entry, title: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-[14px] font-medium outline-none focus:bg-[var(--color-hover)]"
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() =>
                          setItems((current) => current.filter((entry) => entry.id !== item.id))
                        }
                        className="shrink-0 rounded p-1 text-[var(--color-faint)] hover:text-[var(--color-danger)]"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    {item.summary && (
                      <p className="mt-0.5 pl-5 text-[13px] leading-snug text-[var(--color-muted)]">
                        {item.summary}
                      </p>
                    )}
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 pl-5 text-[12px] text-[var(--color-faint)]">
                      <span className="truncate">{item.name}</span>
                      {project && (
                        <span className="inline-flex items-center gap-0.5 text-[var(--color-accent)]">
                          <FolderOpen size={9} /> {project}
                        </span>
                      )}
                      {item.problem && (
                        <span className="text-[var(--color-danger)]">{item.problem}</span>
                      )}
                    </p>
                  </div>
                )
              })}
            </div>

            <div className="sticky bottom-0 z-10 mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] bg-[var(--color-paper)] py-2.5">
              <label className="flex items-center gap-1.5 text-[13px] text-[var(--color-muted)]">
                <input
                  type="checkbox"
                  checked={withSummaries}
                  onChange={(event) => setWithSummaries(event.target.checked)}
                />
                Put the summary at the top of each document
              </label>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setItems([])}
                  className="rounded-md px-3 py-2 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] sm:py-1.5"
                >
                  Throw away
                </button>
                <button
                  type="button"
                  disabled={!usable.length || busy !== null}
                  onClick={() => {
                    onAdd(usable, groupByTopic(usable.map((item) => item.topic)), withSummaries)
                    setItems([])
                  }}
                  className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-[14px] font-medium text-white disabled:opacity-50 sm:py-1.5"
                >
                  Add {usable.length} {usable.length === 1 ? 'document' : 'documents'}
                </button>
              </div>
            </div>
          </>
        )}

        {/*
          Everything already in the collection.

          Hidden while a batch is waiting to be reviewed: that review is a
          decision somebody is in the middle of making, and a list of four
          hundred other documents underneath it is not help.
        */}
        {items.length === 0 && (
          <>
            <div className="mt-3 flex items-center gap-2 rounded-md bg-[var(--color-hover)] px-2.5 py-1.5">
              <Search size={15} className="shrink-0 text-[var(--color-faint)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search everything in here"
                aria-label="Search the library"
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--color-faint)]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="shrink-0 rounded p-0.5 text-[var(--color-faint)] hover:text-[var(--color-ink)]"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {query.trim() ? (
              <div className="mt-3">
                <p className="mb-1.5 text-[13px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
                  Found {hits.length}
                </p>
                {hits.length === 0 ? (
                  <p className="px-1 py-6 text-center text-[14px] text-[var(--color-faint)]">
                    Nothing here matches that.
                  </p>
                ) : (
                  <ul className="space-y-0.5">{hits.map((hit) => documentRow(hit.doc, hit))}</ul>
                )}
              </div>
            ) : shelves.length === 0 ? (
              <p className="px-1 py-8 text-center text-[14px] text-[var(--color-faint)]">
                Nothing in here yet. Drop some files in above.
              </p>
            ) : (
              <>
                <div className="mt-3 flex items-center gap-1 px-0.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-faint)]">
                    {docs.length === 1 ? '1 document' : `${docs.length} documents`}
                  </span>
                  <button
                    type="button"
                    onClick={() => (selecting ? leaveSelecting() : setSelecting(true))}
                    aria-pressed={selecting}
                    className="shrink-0 rounded-md px-2 py-1.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
                  >
                    {selecting ? 'Done' : 'Select'}
                  </button>
                  {/*
                    One button, two labels. A "Collapse all" that stays put
                    once everything is collapsed is a button that has stopped
                    doing anything, and the way back out is not obvious.
                  */}
                  <button
                    type="button"
                    onClick={() => setFolded(shelfKeys, !allFolded)}
                    className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
                  >
                    {allFolded ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
                    {allFolded ? 'Expand all' : 'Collapse all'}
                  </button>
                </div>

                {selecting && (
                  <div className="sticky top-0 z-10 mt-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-2 py-2 shadow-sm">
                    <span className="text-[13px] text-[var(--color-muted)]">
                      {chosen.length} selected
                    </span>
                    <div className="ml-auto flex flex-wrap items-center gap-1">
                      <BulkButton
                        icon={<FolderInput size={14} />}
                        label="Move"
                        disabled={!chosen.length}
                        onClick={() => setMoving({ ids: chosen })}
                      />
                      <BulkButton
                        icon={<Star size={14} />}
                        label="Favourite"
                        disabled={!chosen.length}
                        onClick={() => {
                          for (const id of chosen) onFavorite(id, true)
                          leaveSelecting()
                        }}
                      />
                      <BulkButton
                        icon={<Trash2 size={14} />}
                        label="Delete"
                        danger
                        disabled={!chosen.length}
                        onClick={() => {
                          for (const id of chosen) onDelete(id)
                          leaveSelecting()
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-2 space-y-2">
                  {shelves.map((group) => {
                    const key = `lib-${group.id ?? 'loose'}`
                    const shut = folded(key)
                    const dropId = group.id ?? LOOSE
                    const isTarget = drag?.overFolder === dropId
                    return (
                      <div key={key}>
                        <button
                          type="button"
                          aria-expanded={!shut}
                          data-folder-id={dropId}
                          onClick={() => toggle(key)}
                          className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left hover:bg-[var(--color-hover)] ${
                            isTarget ? 'ring-2 ring-[var(--color-accent)] ring-inset' : ''
                          }`}
                        >
                          <ChevronDown
                            size={14}
                            className={`shrink-0 text-[var(--color-faint)] transition-transform ${
                              shut ? '-rotate-90' : ''
                            }`}
                          />
                          <FolderOpen size={14} className="shrink-0 text-[var(--color-faint)]" />
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                            {group.name}
                          </span>
                          {selecting && (
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`Select everything in ${group.name}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                setSelected((current) => {
                                  const next = new Set(current)
                                  const every = group.docs.every((doc) => next.has(doc.id))
                                  for (const doc of group.docs) {
                                    if (every) next.delete(doc.id)
                                    else next.add(doc.id)
                                  }
                                  return next
                                })
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  event.currentTarget.click()
                                }
                              }}
                              className="shrink-0 rounded p-1 text-[var(--color-faint)] hover:text-[var(--color-ink)]"
                            >
                              <Check size={14} />
                            </span>
                          )}
                          <span className="shrink-0 text-[13px] text-[var(--color-faint)]">
                            {group.docs.length}
                          </span>
                        </button>
                        {!shut && (
                          <ul className="space-y-0.5 pl-3">
                            {group.docs.map((item) => documentRow(item))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      <FolderPicker
        open={moving !== null}
        onClose={() => setMoving(null)}
        projects={projects}
        currentId={
          moving?.ids.length === 1
            ? docs.find((doc) => doc.id === moving.ids[0])?.projectId
            : undefined
        }
        label={moving?.label}
        onMove={(projectId) => {
          for (const id of moving?.ids ?? []) onMove(id, projectId)
          if (selecting) leaveSelecting()
        }}
        onNewFolder={() => {
          const ids = moving?.ids ?? []
          if (ids.length === 1) onNewFolder(ids[0])
          else if (ids.length) onGroup(ids)
          if (selecting) leaveSelecting()
        }}
      />
    </div>
  )
}

function BulkButton({
  icon,
  label,
  danger,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] hover:bg-[var(--color-hover)] disabled:opacity-40 ${
        danger ? 'text-[var(--color-danger)]' : 'text-[var(--color-muted)]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
