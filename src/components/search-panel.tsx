'use client'

import {
  CornerDownLeft,
  FileText,
  Folder,
  LoaderCircle,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { citedSources, gatherSources, splitCitations, type Source } from '@/lib/ask'
import { docLabel } from '@/lib/blocks'
import { buildIndex, looksLikeQuestion, search, type SearchHit } from '@/lib/search'
import type { Doc, Project } from '@/lib/types'
import Snippet from './snippet'

/**
 * Search over everything, and questions about everything, as one panel.
 *
 * The sidebar box used to filter the list you were looking at; this looks
 * inside every document and ranks what it finds. That is the difference
 * between "which file was it" and "I know I wrote this down somewhere" — and
 * the second is the one that actually happens three months later.
 *
 * A question gets an extra row at the top, so the same box answers both "find
 * the Lagos note" and "what did I decide about Lagos". The retrieval for an
 * answer runs here on the device: the local index picks the notes, and only
 * the passages that matched are sent to be read. Every claim comes back with
 * the note it came from attached.
 */
export interface SearchPanelProps {
  open: boolean
  docs: Doc[]
  projects: Project[]
  onClose: () => void
  onOpen: (id: string) => void
}

/** Shown before anything is typed: what you had open lately. */
const RECENT = 6

interface Answer {
  question: string
  text: string
  sources: Source[]
}

export default function SearchPanel({ open, docs, projects, onClose, onOpen }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [asking, setAsking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  /** Whether a key is configured. Null until the server has said. */
  const [aiOn, setAiOn] = useState<boolean | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  /*
    Built once per opening rather than per keystroke. It is linear in the size
    of everything ever written, which is nothing for a few hundred notes and
    very much something for a few thousand — and while this panel is open the
    documents are not being edited, so there is nothing to rebuild for.
  */
  const index = useMemo(() => buildIndex(docs), [docs])

  const hits: SearchHit[] = useMemo(
    () => (query.trim() ? search(index, query, 30) : []),
    [index, query],
  )
  const recent = useMemo(() => docs.filter((d) => !d.deletedAt).slice(0, RECENT), [docs])
  const rows = query.trim() ? hits.map((hit) => hit.doc) : recent

  /*
    Whether the question row is offered.

    It leads the list when the query reads like a question, so Enter asks; it
    sits under the results otherwise, so Enter still opens the document. Both
    remain one key apart, which is why the test for a question can afford to
    be as rough as it is.
  */
  const canAsk = aiOn === true && query.trim().length > 2 && docs.length > 0
  const askLeads = canAsk && looksLikeQuestion(query)
  const total = rows.length + (canAsk ? 1 : 0)

  // Reset when the results change underneath the highlight. Adjusted during
  // render rather than in an effect: an effect paints one frame with the old
  // row highlighted against the new list.
  const [lastQuery, setLastQuery] = useState(query)
  if (query !== lastQuery) {
    setLastQuery(query)
    setActive(0)
    setProblem(null)
    if (answer && answer.question !== query.trim()) setAnswer(null)
  }
  if (active >= total && active !== 0) setActive(0)

  // Cleared on close, so reopening starts fresh instead of on an old search.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) {
      setQuery('')
      setAnswer(null)
      setProblem(null)
    }
  }

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  // Asked once, the first time the panel is opened. A missing key means the
  // question row is never offered, rather than offered and then failing.
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
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  })

  if (!open) return null

  const choose = (id: string) => {
    onOpen(id)
    onClose()
  }

  const runAsk = async () => {
    const question = query.trim()
    if (!question || asking) return
    setAsking(true)
    setProblem(null)
    setAnswer(null)
    // Retrieval first, on this device. Only the passages that bear on the
    // question are sent — never the collection.
    const sources = gatherSources(docs, question)
    if (!sources.length) {
      setProblem('There is nothing written yet to answer from.')
      setAsking(false)
      return
    }
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ask',
          question,
          sources: sources.map(({ n, title, text, updatedAt }) => ({ n, title, text, updatedAt })),
        }),
      })
      const data = (await response.json()) as { text?: string; error?: string }
      if (!response.ok || !data.text) {
        setProblem(data.error ?? 'That did not work. Try again.')
        return
      }
      setAnswer({ question, text: data.text, sources })
    } catch {
      setProblem('Could not reach the answering service. Everything you wrote is untouched.')
    } finally {
      setAsking(false)
    }
  }

  /** Where the question row sits in the keyboard order. */
  const askIndex = askLeads ? 0 : rows.length
  const rowIndex = (i: number) => (askLeads ? i + 1 : i)

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => (total ? (i + 1) % total : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (total ? (i - 1 + total) % total : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (canAsk && active === askIndex) void runAsk()
      else {
        const doc = rows[askLeads ? active - 1 : active]
        if (doc) choose(doc.id)
      }
    }
  }

  const projectName = (doc: Doc) =>
    doc.projectId ? (projects.find((p) => p.id === doc.projectId)?.name ?? null) : null

  const askRow = (
    <button
      type="button"
      data-active={active === askIndex}
      data-ask-row
      onPointerEnter={() => setActive(askIndex)}
      onClick={() => void runAsk()}
      disabled={asking}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
        active === askIndex ? 'bg-[var(--color-hover)]' : ''
      }`}
    >
      {asking ? (
        <LoaderCircle size={14} className="shrink-0 animate-spin text-[var(--color-accent)]" />
      ) : (
        <Sparkles size={14} className="shrink-0 text-[var(--color-accent)]" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">
          {asking ? 'Reading your notes…' : 'Ask across your notes'}
        </span>
        <span className="block truncate text-[10px] text-[var(--color-faint)]">
          “{query.trim()}”
        </span>
      </span>
      {active === askIndex && !asking && (
        <CornerDownLeft size={12} className="shrink-0 text-[var(--color-faint)]" />
      )}
    </button>
  )

  return (
    <>
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/30"
      />
      <div
        role="dialog"
        aria-label="Search"
        onKeyDown={onKeyDown}
        // Full height on a phone, a floating panel on a desktop. A phone
        // keyboard takes half the screen, and a short panel above it leaves
        // room for about two results.
        className="fixed inset-0 z-50 flex flex-col bg-[var(--color-paper)] sm:inset-x-0 sm:top-[10vh] sm:bottom-auto sm:mx-auto sm:max-h-[70vh] sm:w-[36rem] sm:rounded-xl sm:border sm:border-[var(--color-line)] sm:shadow-2xl"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-line)] px-3 py-2.5">
          <Search size={15} className="shrink-0 text-[var(--color-faint)]" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, or ask a question"
            aria-label="Search everything"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-faint)]"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <X size={15} />
          </button>
        </div>

        <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {!query.trim() && (
            <p className="px-2 py-1.5 text-[11px] text-[var(--color-faint)]">Recent</p>
          )}

          {askLeads && askRow}

          {answer && (
            <AnswerCard answer={answer} onOpenSource={(id) => choose(id)} />
          )}

          {problem && (
            <p
              role="status"
              className="mx-1 my-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-hover)] px-2.5 py-2 text-[11px] leading-snug text-[var(--color-danger)]"
            >
              {problem}
            </p>
          )}

          {query.trim() && !hits.length && (
            <p className="px-2 py-4 text-center text-xs text-[var(--color-muted)]">
              Nothing matches “{query.trim()}”.
            </p>
          )}

          {rows.map((doc, i) => {
            const hit = query.trim() ? hits[i] : null
            const project = projectName(doc)
            const at = rowIndex(i)
            return (
              <button
                key={doc.id}
                type="button"
                data-active={at === active}
                onPointerEnter={() => setActive(at)}
                onClick={() => choose(doc.id)}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                  at === active ? 'bg-[var(--color-hover)]' : ''
                }`}
              >
                <FileText size={14} className="mt-0.5 shrink-0 text-[var(--color-faint)]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">
                      {docLabel(doc)}
                    </span>
                    {project && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-[var(--color-faint)]">
                        <Folder size={9} /> {project}
                      </span>
                    )}
                  </span>
                  {hit && (
                    <span className="mt-0.5 block text-[11px] leading-snug text-[var(--color-muted)]">
                      <Snippet text={hit.snippet} highlights={hit.highlights} />
                    </span>
                  )}
                </span>
                {at === active && (
                  <CornerDownLeft size={12} className="mt-0.5 shrink-0 text-[var(--color-faint)]" />
                )}
              </button>
            )
          })}

          {canAsk && !askLeads && askRow}
        </div>
      </div>
    </>
  )
}

/**
 * An answer, with every claim traceable to the note it came from.
 *
 * The citations are the point. An assistant that summarises your notes and
 * cannot show you where a line came from is one you have to either trust
 * completely or check completely, and neither is worth the time it saves.
 */
function AnswerCard({
  answer,
  onOpenSource,
}: {
  answer: Answer
  onOpenSource: (docId: string) => void
}) {
  const cited = citedSources(answer.text, answer.sources)
  const byNumber = new Map(answer.sources.map((source) => [source.n, source]))

  return (
    <div
      className="mx-1 mb-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] p-2.5"
      aria-label="Answer"
      role="region"
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] text-[var(--color-faint)]">
        <Sparkles size={11} className="text-[var(--color-accent)]" />
        From your notes
      </p>
      <div className="text-xs leading-relaxed whitespace-pre-wrap">
        {splitCitations(answer.text).map((part, i) =>
          part.kind === 'text' ? (
            <span key={i}>{part.text}</span>
          ) : (
            <button
              key={i}
              type="button"
              title={byNumber.get(part.n)?.title ?? 'Source'}
              onClick={() => {
                const source = byNumber.get(part.n)
                if (source) onOpenSource(source.docId)
              }}
              className="mx-0.5 rounded bg-[var(--color-accent)]/15 px-1 align-super text-[9px] font-medium text-[var(--color-accent)]"
            >
              {part.n}
            </button>
          ),
        )}
      </div>

      {cited.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-[var(--color-line)] pt-2">
          {cited.map((source) => (
            <button
              key={source.docId}
              type="button"
              onClick={() => onOpenSource(source.docId)}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] px-1.5 py-1 text-[10px] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              <span className="text-[var(--color-accent)]">{source.n}</span>
              <FileText size={9} />
              <span className="truncate">{source.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


