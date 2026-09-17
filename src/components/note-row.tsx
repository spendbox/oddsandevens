'use client'

import { Star } from 'lucide-react'
import { docLabel, docOpening } from '@/lib/blocks'
import type { Doc } from '@/lib/types'
import { stamp } from '@/lib/when'
import { KindTile } from './note-kind'

/**
 * One note in a list: what it is, what it is called, how it starts, and when.
 *
 * ## Why a row and not a card
 *
 * Because a list of notes is read down the left edge. Cards in a grid make the
 * eye travel in two directions and give every note the same weight regardless
 * of what is in it; a row lets the title, the opening and the time line up in
 * three columns that the eye can run down separately. It is what every mail
 * client, every messaging app and every notes app has converged on, and they
 * did not converge by accident.
 *
 * ## Two lines of the note, not one
 *
 * One line is a label; two is enough to recognise a note you cannot remember
 * naming — which is most of them, because the caret starts in the body and
 * plenty of notes never get a title at all. Three would make the list scroll
 * twice as far for a third as much recognition.
 *
 * Separated by a hairline rather than sitting in a box each: forty boxes is
 * forty borders, and the page stops looking like a list of writing.
 */
export default function NoteRow({
  doc,
  onOpen,
  onFavorite,
  now,
  /** Painted over the title and the opening, for a search result. */
  highlight,
}: {
  doc: Doc
  onOpen: (id: string) => void
  onFavorite?: (id: string, favorite: boolean) => void
  now?: number
  highlight?: (text: string) => React.ReactNode
}) {
  const starred = !!doc.favoritedAt
  const label = docLabel(doc)
  const opening = docOpening(doc)
  const mark = highlight ?? ((text: string) => text)

  return (
    <li className="group/row relative border-b border-[var(--color-line)] last:border-b-0">
      <button
        type="button"
        onClick={() => onOpen(doc.id)}
        className="flex w-full items-start gap-3 px-1 py-3.5 text-left hover:bg-[var(--color-hover)]"
      >
        <KindTile doc={doc} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-3">
            <span className="pad-serif min-w-0 flex-1 truncate text-[16px] font-semibold">
              {mark(label)}
            </span>
            {/*
              The time is the last thing on the line and never moves, so the
              column of them can be read on its own. It does not shrink: a
              wrapped "Yesterday" is the one thing on this row that would make
              it two rows tall.
            */}
            <span className="shrink-0 text-[12px] text-[var(--color-faint)] tabular-nums">
              {stamp(doc.updatedAt, now)}
            </span>
          </span>
          <span className="pad-serif mt-0.5 line-clamp-2 block pr-7 text-[14px] leading-snug text-[var(--color-muted)]">
            {opening ? mark(opening) : 'Nothing written yet.'}
          </span>
        </span>
      </button>
      {onFavorite && (
        <button
          type="button"
          aria-label={
            starred ? `Remove ${label} from favourites` : `Add ${label} to favourites`
          }
          aria-pressed={starred}
          onClick={() => onFavorite(doc.id, !starred)}
          /*
            Shown on hover on a desktop, and always on a touch screen — there
            is no hover on a phone, and a control that only appears under a
            pointer is a control a phone does not have. `group-hover` cannot
            express that, so the star is simply always there below `sm`.
          */
          className={`absolute right-1 bottom-2 rounded-md p-2 sm:opacity-0 sm:group-hover/row:opacity-100 sm:focus:opacity-100 ${
            starred
              ? 'text-[var(--color-accent)] sm:opacity-100'
              : 'text-[var(--color-faint)] hover:text-[var(--color-ink)]'
          }`}
        >
          <Star size={13} fill={starred ? 'currentColor' : 'none'} />
        </button>
      )}
    </li>
  )
}
