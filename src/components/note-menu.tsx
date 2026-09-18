'use client'

import {
  FileDown,
  FileType,
  Globe2,
  Link2,
  ListChecks,
  Printer,
  Star,
  Trash2,
} from 'lucide-react'
import { useRef, useState, type RefObject } from 'react'
import { docToMarkdown, safeFilename } from '@/lib/export'
import type { Doc } from '@/lib/types'
import { useDismiss } from './dismiss'

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
  onFavorite,
  onIgnoreTasks,
  onShare,
  onDelete,
  onClose,
  trigger,
}: {
  doc: Doc
  onFavorite: (favorite: boolean) => void
  /** Whether this note is one the Actions tab reads. */
  onIgnoreTasks: (ignore: boolean) => void
  /**
   * Opens the share panel.
   *
   * The panel is not rendered here: this menu closes on a press outside
   * itself, and a panel drawn inside it would go with it. The note owns the
   * panel; the menu is one of the two ways to ask for it.
   */
  onShare: () => void
  onDelete: () => void
  onClose: () => void
  /**
   * The ⋯ itself.
   *
   * It is not "outside": pressing it a second time used to close this on
   * pointerdown and then have the button's own click toggle it straight back
   * open, so the control that opened the menu could not close it.
   */
  trigger: RefObject<HTMLElement | null>
}) {
  const [confirming, setConfirming] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useDismiss(onClose, root, trigger)

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

      {/*
        Two ways to let somebody else read this, and both of them open the
        same panel.

        Listing a note in the World used to be a tickbox that appeared inside
        this menu only after a link had already been made — so the way to put
        a note in the World was to press something that does not mention the
        World. It says what it is now, on its own row, and what opens is a
        panel that closes when you press outside it.
      */}
      <Row
        icon={<Link2 size={15} />}
        label="Share a link"
        hint="A read-only copy at an address you send to people"
        onRun={() => {
          onShare()
          onClose()
        }}
      />
      <Row
        icon={<Globe2 size={15} />}
        label="Share to the World"
        hint="Anyone can find it, search it and save a copy"
        onRun={() => {
          onShare()
          onClose()
        }}
      />

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
