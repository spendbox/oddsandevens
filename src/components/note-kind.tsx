'use client'

import { CircleCheck, FileSearch, Lightbulb, StickyNote, User, Users } from 'lucide-react'
import { KIND_LABELS, kindOf, type NoteKind } from '@/lib/kind'
import type { Doc } from '@/lib/types'
import { longStamp } from '@/lib/when'

/**
 * The picture and the word for a note's kind.
 *
 * Which kind a note is lives in `lib/kind.ts`, which is plain data and has a
 * test; this file is only the translation from a kind to a glyph and a tile.
 * The split is the one `doc-icon.tsx` and `plan.ts` both make, and for the
 * same reason: the thing worth testing is which kind a note gets, not which
 * SVG it resolves to.
 */
const GLYPHS: Record<NoteKind, React.ComponentType<{ size?: number; className?: string }>> = {
  meeting: Users,
  task: CircleCheck,
  idea: Lightbulb,
  person: User,
  research: FileSearch,
  note: StickyNote,
}

/**
 * The small green tile beside a note in a list.
 *
 * A tile rather than a bare icon because a row of bare icons on a cream page
 * has nothing to line up against, and forty of them read as speckle. The
 * colour is the app's one green, so a list of notes has exactly one accent in
 * it however many kinds are on screen.
 */
export function KindTile({ doc, size = 34 }: { doc: Doc; size?: number }) {
  const kind = kindOf(doc)
  const Glyph = GLYPHS[kind]
  return (
    <span
      // The label is read out, so the tile is not a picture a screen reader
      // has to skip — it carries the same word the sighted reader gets from
      // the line under the title.
      role="img"
      aria-label={KIND_LABELS[kind]}
      className="flex shrink-0 items-center justify-center rounded-[10px] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
      style={{ width: size, height: size }}
    >
      <Glyph size={Math.round(size * 0.5)} />
    </span>
  )
}

/**
 * The line above a note's title: what it is, and when it was written.
 *
 * One line rather than two chips, because it is a sentence — "a meeting, from
 * this afternoon" — and a sentence is read in one movement. The dot is the
 * separator every mail client uses for exactly this.
 */
export function KindLine({ doc, now }: { doc: Doc; now?: number }) {
  const kind = kindOf(doc)
  const Glyph = GLYPHS[kind]
  return (
    <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--color-accent)]">
      <Glyph size={14} />
      <span>{KIND_LABELS[kind]}</span>
      <span aria-hidden className="text-[var(--color-faint)]">
        ·
      </span>
      {/* The time is not the accent colour: it is a fact about the note, not
          a thing to find it by, and two greens on one line is one too many. */}
      <span className="font-normal text-[var(--color-muted)]">{longStamp(doc.updatedAt, now)}</span>
    </p>
  )
}
