'use client'

import { FileText, FolderOpen, Library, LoaderCircle, Search, Sparkles, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { docLabel, docPreview, makeBlock } from '@/lib/blocks'
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
import { buildIndex, search } from '@/lib/search'
import { saveFile } from '@/lib/store'
import { blockText, type Block, type Doc } from '@/lib/types'

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
 * side is ordinary documents in the ordinary sidebar, searchable and
 * answerable like everything else — the library is a way in, not a container.
 *
 * ## Why it also lists everything
 *
 * It used to be a drop zone and nothing else: you could put documents in and
 * then never see them here again, which made "Library" a strange name for a
 * one-way door. So the whole collection is listed underneath, searchable,
 * newest first. That is not a second store — these are the same documents the
 * sidebar shows, read from the same place — it is the one screen where all of
 * them are visible at once, which is precisely what the sidebar stopped
 * trying to be.
 *
 * ## Why the search is the app's search
 *
 * Because there is only one. A box that filters filenames and a box that
 * searches inside documents behave differently and teach people to distrust
 * both; this uses `lib/search.ts`, the same BM25 index as the search panel,
 * so a word remembered from the middle of a page finds it here too.
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

export interface LibraryPanelProps {
  open: boolean
  onClose: () => void
  /** Everything already in the collection, newest first. */
  docs: Doc[]
  /** Opens one of them and closes the Library. */
  onOpen: (id: string) => void
  /** Adds the finished documents, grouping them as the review showed. */
  onAdd: (items: Incoming[], groups: Grouping[], withSummaries: boolean) => void
}

/** How much of a document the model is shown in order to name it. */
const EXCERPT_CHARS = 1_200
/** Files per batch. A hundred at once is a timeout, not a feature. */
const MAX_FILES = 25

export default function LibraryPanel({
  open,
  onClose,
  docs,
  onOpen,
  onAdd,
}: LibraryPanelProps) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<Incoming[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [withSummaries, setWithSummaries] = useState(true)
  const [aiOn, setAiOn] = useState<boolean | null>(null)
  const [over, setOver] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  // Cleared on close, so the next opening is not somebody else's batch.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setItems([])
      setProblem(null)
      setBusy(null)
      setQuery('')
    }
  }

  useEffect(() => {
    if (!open || aiOn !== null) return
    let cancelled = false
    void fetch('/api/ai')
      .then((r) => r.json() as Promise<{ configured?: boolean }>)
      .then((data) => {
        if (!cancelled) setAiOn(!!data.configured)
      })
      .catch(() => {
        if (!cancelled) setAiOn(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, aiOn])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /*
    Built once per opening, not per keystroke: the index is linear in the size
    of everything ever written, and while this panel is up nothing is being
    edited. The same reasoning, and the same function, as the search panel.
  */
  const index = useMemo(() => buildIndex(docs), [docs])
  const shelf = useMemo(() => {
    const live = docs.filter((doc) => !doc.deletedAt)
    if (!query.trim()) return live
    return search(index, query, 60).map((hit) => hit.doc)
  }, [docs, index, query])

  if (!open) return null

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
    if (aiOn !== true || !readable.length) return

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
            ? { ...item, title: match.title, summary: match.summary || item.summary, topic: match.topic || item.topic }
            : item
        }),
      )
    } catch {
      setProblem('Kept the titles worked out on this device.')
    } finally {
      setBusy(null)
    }
  }

  const groups = groupByTopic(items.map((item) => item.topic))
  const projectFor = (index: number) =>
    groups.find((group) => group.name && group.members.includes(index))?.name ?? null
  const usable = items.filter((item) => item.blocks.length)

  return (
    <>
      <button
        type="button"
        aria-label="Close library"
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/30"
      />
      <div
        role="dialog"
        aria-label="Library"
        className="fixed inset-0 z-50 flex flex-col bg-[var(--color-paper)] sm:inset-x-0 sm:top-[6vh] sm:bottom-auto sm:mx-auto sm:max-h-[86vh] sm:w-[44rem] sm:rounded-xl sm:border sm:border-[var(--color-line)] sm:shadow-2xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-line)] px-3 py-2.5">
          <Library size={16} className="shrink-0 text-[var(--color-accent)]" />
          <span className="text-[15px] font-medium">Library</span>
          <span className="text-[13px] text-[var(--color-faint)]">
            {docs.length === 1 ? '1 document' : `${docs.length} documents`}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto shrink-0 rounded-md p-1 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <X size={16} />
          </button>
        </div>

        {/*
          Search above the shelf, because with four hundred documents in here
          the list is not how anybody finds one. It is the app's search, over
          contents as well as names — see the note at the top of this file.
        */}
        <div className="shrink-0 border-b border-[var(--color-line)] px-3 py-2">
          <div className="flex items-center gap-2 rounded-md bg-[var(--color-hover)] px-2.5 py-1.5">
            <Search size={15} className="shrink-0 text-[var(--color-faint)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {/*
            The drop zone is also a button, because dragging is a mouse gesture
            and half the people using this are holding a phone.
          */}
          <button
            type="button"
            onClick={() => picker.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              void take([...e.dataTransfer.files])
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
                PDF, Word, text and markdown are read into editable text. Anything else is kept as
                a file.
              </span>
            </span>
          </button>
          <input
            ref={picker}
            type="file"
            multiple
            aria-label="Choose documents"
            onChange={(e) => {
              void take([...(e.target.files ?? [])])
              e.target.value = ''
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
                {aiOn ? <Sparkles size={12} className="text-[var(--color-accent)]" /> : null}
                {items.length} ready. Every title can be changed before anything is added.
              </p>

              <div className="space-y-1.5">
                {items.map((item, i) => {
                  const project = projectFor(i)
                  return (
                    <div
                      key={item.id}
                      className="rounded-lg border border-[var(--color-line)] p-2"
                    >
                      <div className="flex items-center gap-2">
                        <FileText size={13} className="shrink-0 text-[var(--color-faint)]" />
                        <input
                          value={item.title}
                          aria-label={`Title for ${item.name}`}
                          onChange={(e) =>
                            setItems((current) =>
                              current.map((entry) =>
                                entry.id === item.id ? { ...entry, title: e.target.value } : entry,
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
            </>
          )}

          {/*
            Everything already in the collection.

            Hidden while a batch is waiting to be reviewed: that review is a
            decision somebody is in the middle of making, and a list of four
            hundred other documents underneath it is not help.
          */}
          {items.length === 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[13px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
                {query.trim() ? `Found ${shelf.length}` : 'Everything'}
              </p>
              {shelf.length === 0 ? (
                <p className="px-1 py-6 text-center text-[14px] text-[var(--color-faint)]">
                  {query.trim()
                    ? 'Nothing here matches that.'
                    : 'Nothing in here yet. Drop some files in above.'}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {shelf.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onOpen(item.id)
                          onClose()
                        }}
                        className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-[var(--color-hover)]"
                      >
                        <FileText size={15} className="mt-0.5 shrink-0 text-[var(--color-faint)]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium">
                            {docLabel(item)}
                          </span>
                          <span className="block truncate text-[13px] text-[var(--color-muted)]">
                            {docPreview(item.blocks)}
                          </span>
                        </span>
                        <span className="shrink-0 pt-0.5 text-[12px] text-[var(--color-faint)]">
                          {new Date(item.updatedAt).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--color-line)] px-3 py-2.5">
            <label className="flex items-center gap-1.5 text-[13px] text-[var(--color-muted)]">
              <input
                type="checkbox"
                checked={withSummaries}
                onChange={(e) => setWithSummaries(e.target.checked)}
              />
              Put the summary at the top of each document
            </label>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-2 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] sm:py-1.5"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!usable.length || busy !== null}
                onClick={() => {
                  onAdd(usable, groupByTopic(usable.map((item) => item.topic)), withSummaries)
                  onClose()
                }}
                className="rounded-md bg-[var(--color-accent)] px-3 py-2 text-[14px] font-medium text-white disabled:opacity-50 sm:py-1.5"
              >
                Add {usable.length} {usable.length === 1 ? 'document' : 'documents'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
