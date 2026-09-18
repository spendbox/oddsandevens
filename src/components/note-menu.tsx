'use client'

import {
  Check,
  Copy,
  FileDown,
  FileType,
  Globe2,
  Link2,
  Link2Off,
  ListChecks,
  LoaderCircle,
  Printer,
  Star,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { docToMarkdown, safeFilename } from '@/lib/export'
import { useName } from '@/lib/profile'
import { publishDoc, shareState, unpublishDoc } from '@/lib/share'
import type { Doc } from '@/lib/types'

/**
 * Everything you can do to a note that is not writing in it.
 *
 * ## Why it is a menu again
 *
 * It was a column of folding sections down the side of the page, because it
 * had twelve rows in it: where the note was filed, which typing mode it used,
 * what it was for, four ways to export, two ways to import. There are five
 * things now, and five things is exactly what a ⋯ is for. The side menu it
 * lived in is gone with it — a strip of the application down the side of
 * somebody's writing was the app taking up room to say nothing.
 *
 * ## Why the destructive one asks
 *
 * Because it is the one row here that cannot be undone by pressing it again,
 * and it sits in the same list as "copy a link". A note goes to the trash for
 * seven days either way, but the question is still asked, because a menu that
 * deletes on a single tap is a menu people learn to be careful near.
 */
export default function NoteMenu({
  doc,
  accountId,
  onFavorite,
  onIgnoreTasks,
  onDelete,
  onClose,
}: {
  doc: Doc
  /** Null when nobody is signed in, which is what sharing requires. */
  accountId: string | null
  onFavorite: (favorite: boolean) => void
  /** Whether this note is one the Actions tab reads. */
  onIgnoreTasks: (ignore: boolean) => void
  onDelete: () => void
  onClose: () => void
}) {
  /*
    What a shared copy is credited to. The name they call themselves in the
    app, which lives on the device beside the theme — the account knows an
    email address and nobody wants their email address on a note in the
    World.
  */
  const { name } = useName()
  const [share, setShare] = useState<{
    url: string | null
    /** Whether the shared copy is in the World, or only at its own link. */
    listed: boolean
    busy: boolean
    problem?: string
  }>({ url: null, listed: false, busy: false })
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  // Looked up once per note rather than on every render, so a note shared
  // earlier still shows its link after a reload.
  useEffect(() => {
    if (!accountId) return
    let cancelled = false
    void shareState(doc.id, accountId).then((state) => {
      if (!cancelled) {
        setShare((current) => (current.busy ? current : { ...state, busy: false }))
      }
    })
    return () => {
      cancelled = true
    }
  }, [accountId, doc.id])

  /*
    Closed by testing where the press landed, never by stopPropagation.
    Relying on propagation closes the menu on pointerdown and unmounts the
    button before its own click can fire — which is how every item in a menu
    ends up doing nothing.
  */
  useEffect(() => {
    const close = (event: Event) => {
      const el = event.target as Element | null
      if (el && root.current?.contains(el)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const download = () => {
    const blob = new Blob([docToMarkdown(doc)], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = safeFilename(doc.title, 'md')
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    onClose()
  }

  const starred = !!doc.favoritedAt

  return (
    <div
      ref={root}
      role="menu"
      aria-label="This note"
      // Full width on a phone, where a panel hanging off a button near the
      // right-hand edge is half off the side of the screen.
      className="fixed inset-x-2 top-14 z-50 max-h-[70dvh] overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-1 shadow-2xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-1 sm:w-72"
    >
      <Row
        icon={<Star size={15} fill={starred ? 'currentColor' : 'none'} />}
        label={starred ? 'Remove from favourites' : 'Add to favourites'}
        onRun={() => {
          onFavorite(!starred)
          onClose()
        }}
      />

      <div className="my-1 h-px bg-[var(--color-line)]" />

      {share.url ? (
        <div className="px-2 py-1.5">
          <p className="mb-1 text-[12px] text-[var(--color-faint)]">
            {share.listed
              ? 'In the World, where anyone can find it'
              : 'Anyone with this link can read it'}
          </p>
          <div className="flex items-center gap-1">
            <input
              readOnly
              value={share.url}
              aria-label="Share link"
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 rounded border border-[var(--color-line)] bg-[var(--color-hover)] px-1.5 py-1 text-[12px] outline-none"
            />
            <button
              type="button"
              aria-label="Copy link"
              onClick={() => {
                navigator.clipboard?.writeText(share.url ?? '').then(
                  () => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  },
                  () => {
                    // Clipboard access can be refused. The link is on screen
                    // and selectable, so this is not a dead end.
                  },
                )
              }}
              className="shrink-0 rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              {copied ? <Check size={14} className="text-[var(--color-good)]" /> : <Copy size={14} />}
            </button>
          </div>
          {/*
            And the second, separate act: putting it where anyone can find
            it.

            A link is sent to particular people; a listing is left in the
            World. They are one flag apart in the database and a long way
            apart in what somebody means, so this is never implied by
            sharing — it is its own switch, it says what it does in the
            present tense, and turning it off leaves the link working for
            whoever already has it.
          */}
          <label className="mt-1.5 flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1.5 hover:bg-[var(--color-hover)]">
            <input
              type="checkbox"
              checked={share.listed}
              disabled={share.busy}
              onChange={(event) => {
                if (!accountId) return
                const listed = event.currentTarget.checked
                setShare({ url: share.url, listed, busy: true })
                void publishDoc(doc, accountId, { listed, author: name }).then((result) =>
                  setShare({
                    url: result.url ?? share.url,
                    listed: result.ok ? listed : !listed,
                    busy: false,
                    problem: result.problem,
                  }),
                )
              }}
              className="mt-0.5 accent-[var(--color-accent)]"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[13px]">
                <Globe2 size={13} className="shrink-0 text-[var(--color-muted)]" />
                List it in the World
              </span>
              <span className="block text-[12px] text-[var(--color-faint)]">
                Anyone can find it there, search it and save a copy
              </span>
            </span>
          </label>
          <div className="mt-1 flex gap-1">
            <button
              type="button"
              onClick={() => {
                if (!accountId) return
                setShare({ url: share.url, listed: share.listed, busy: true })
                void publishDoc(doc, accountId, { listed: share.listed, author: name }).then(
                  (result) =>
                    setShare({
                      url: result.url ?? null,
                      listed: share.listed,
                      busy: false,
                      problem: result.problem,
                    }),
                )
              }}
              className="rounded-md px-1.5 py-1 text-[12px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              Update the shared copy
            </button>
            <button
              type="button"
              onClick={() => {
                if (!accountId) return
                setShare({ url: null, listed: false, busy: true })
                void unpublishDoc(doc.id, accountId).then(() =>
                  setShare({ url: null, listed: false, busy: false }),
                )
              }}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              <Link2Off size={12} /> Stop sharing
            </button>
          </div>
        </div>
      ) : (
        <Row
          icon={share.busy ? <LoaderCircle size={15} className="animate-spin" /> : <Link2 size={15} />}
          label="Share a link"
          hint={accountId ? 'A read-only copy at a public address' : 'Needs an account'}
          disabled={!accountId || share.busy}
          onRun={() => {
            if (!accountId) return
            setShare({ url: null, listed: false, busy: true })
            void publishDoc(doc, accountId, { author: name }).then((result) =>
              setShare({
                url: result.url ?? null,
                listed: !!result.listed,
                busy: false,
                problem: result.problem,
              }),
            )
          }}
        />
      )}
      {share.problem && (
        <p className="px-2 py-1 text-[12px] text-[var(--color-danger)]">{share.problem}</p>
      )}

      <div className="my-1 h-px bg-[var(--color-line)]" />

      {/*
        Whether the Actions tab reads this note.

        The same question the box asks when a note is written, in the one
        place a note's own settings live — because an answer given in a hurry
        while typing has to be changeable later, and because a note that
        turned into a list of things to do after the fact should be able to
        say so.
      */}
      <Row
        icon={<ListChecks size={15} />}
        label={doc.ignoreTasks ? 'Find tasks in this note' : 'Ignore tasks in this note'}
        hint={
          doc.ignoreTasks
            ? 'Its boxes and commitments go back to Actions'
            : 'It stops appearing in Actions. Nothing in it changes'
        }
        onRun={() => {
          onIgnoreTasks(!doc.ignoreTasks)
          onClose()
        }}
      />

      <div className="my-1 h-px bg-[var(--color-line)]" />

      {/*
        PDF is the browser's own print pipeline, not a PDF writer: it already
        has a typesetter that handles page breaks and fonts properly, and it
        costs no download at all.
      */}
      <Row
        icon={<Printer size={15} />}
        label="Save as PDF"
        hint="Opens Print — choose Save as PDF"
        onRun={() => {
          onClose()
          setTimeout(() => window.print(), 50)
        }}
      />
      <Row
        icon={<FileDown size={15} />}
        label="Download as Markdown"
        hint="Opens anywhere, and keeps the structure"
        onRun={download}
      />
      <Row
        icon={<FileType size={15} />}
        label="Download as Word"
        onRun={() => {
          // Loaded here rather than with the page: nobody downloads a Word
          // file on most visits, and the writer is not small.
          void (async () => {
            try {
              const { docToDocx } = await import('@/lib/docx')
              const blob = await docToDocx(doc)
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = safeFilename(doc.title, 'docx')
              link.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
              onClose()
            } catch (error) {
              setProblem(
                error instanceof Error ? error.message : 'Could not build the Word file.',
              )
            }
          })()
        }}
      />
      {problem && <p className="px-2 py-1 text-[12px] text-[var(--color-danger)]">{problem}</p>}

      <div className="my-1 h-px bg-[var(--color-line)]" />

      {confirming ? (
        <div className="px-2 py-1.5">
          <p className="mb-1.5 text-[13px]">
            Move “{doc.title.trim() || 'this note'}” to the trash?
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                onDelete()
                onClose()
              }}
              className="rounded-md bg-[var(--color-danger)] px-2 py-1 text-[13px] text-white"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md px-2 py-1 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              Keep it
            </button>
          </div>
          <p className="mt-1 text-[12px] text-[var(--color-faint)]">
            Recoverable from the trash for 7 days.
          </p>
        </div>
      ) : (
        <Row
          icon={<Trash2 size={15} />}
          label="Delete this note"
          danger
          onRun={() => setConfirming(true)}
        />
      )}
    </div>
  )
}

/** One row of the menu. One shape, so they all behave the same. */
function Row({
  icon,
  label,
  hint,
  danger,
  disabled,
  onRun,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  danger?: boolean
  disabled?: boolean
  onRun: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onRun}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[14px] hover:bg-[var(--color-hover)] disabled:opacity-50 ${
        danger ? 'text-[var(--color-danger)]' : ''
      }`}
    >
      <span className={`shrink-0 ${danger ? '' : 'text-[var(--color-muted)]'}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {hint && (
          <span className="block truncate text-[12px] text-[var(--color-faint)]">{hint}</span>
        )}
      </span>
    </button>
  )
}
