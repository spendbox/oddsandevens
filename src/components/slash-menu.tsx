'use client'

import {
  CheckSquare,
  ClipboardList,
  Code2,
  FileText,
  Paperclip,
  Heading1,
  Heading2,
  Heading3,
  List,
  Minus,
  Quote,
  Table2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type IconName, rankItems } from '@/lib/slash-items'
import type { BlockType } from '@/lib/types'

/**
 * The slash menu is the whole navigation model of this app.
 *
 * There are no mode switches, no "new spreadsheet" button and no file-type
 * chooser, because every tool is a block and every block arrives the same
 * way: type "/" and pick. That is what lets five tools share one interface
 * without the interface growing five toolbars.
 *
 * The matching itself lives in lib/slash-items.ts, where it can be tested;
 * this file is the keyboard handling and the paint.
 */
export interface SlashChoice {
  type: BlockType
  level?: 1 | 2 | 3
}

const SIZE = 15

const ICONS: Record<IconName, React.ReactNode> = {
  text: <FileText size={SIZE} />,
  h1: <Heading1 size={SIZE} />,
  h2: <Heading2 size={SIZE} />,
  h3: <Heading3 size={SIZE} />,
  todo: <CheckSquare size={SIZE} />,
  bullet: <List size={SIZE} />,
  table: <Table2 size={SIZE} />,
  code: <Code2 size={SIZE} />,
  form: <ClipboardList size={SIZE} />,
  file: <Paperclip size={SIZE} />,
  quote: <Quote size={SIZE} />,
  divider: <Minus size={SIZE} />,
}

export default function SlashMenu({
  query,
  onPick,
  onClose,
}: {
  query: string
  onPick: (choice: SlashChoice) => void
  onClose: () => void
}) {
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => rankItems(query), [query])

  // Resetting the highlight when the filter changes, during render rather
  // than in an effect. An effect would paint the stale highlight for a frame
  // first, and Enter in that frame would insert the wrong block.
  const [lastQuery, setLastQuery] = useState(query)
  if (query !== lastQuery) {
    setLastQuery(query)
    setActive(0)
  }

  // The block that opened the menu still holds focus, so these are caught at
  // the document level, in the capture phase, before the editable sees them.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((a) => (matches.length ? (a + 1) % matches.length : 0))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((a) => (matches.length ? (a - 1 + matches.length) % matches.length : 0))
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        if (!matches.length) return
        event.preventDefault()
        const chosen = matches[Math.min(active, matches.length - 1)]
        onPick({ type: chosen.type, level: chosen.level })
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [matches, active, onPick, onClose])

  // Keep the highlighted row in view when arrowing past the visible window.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  // On a phone the virtual keyboard covers the bottom half of the screen, and
  // the menu opens directly under the caret — which is often behind it. Ask
  // the browser to bring the whole menu into the visible area once, on open.
  useEffect(() => {
    const timer = setTimeout(
      () => listRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      // After the keyboard has had a moment to resize the viewport; doing it
      // immediately measures against a screen that is about to shrink.
      150,
    )
    return () => clearTimeout(timer)
  }, [])

  if (!matches.length) {
    return (
      <div className="absolute z-40 mt-1 w-64 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-3 text-xs text-[var(--color-faint)] shadow-lg">
        Nothing matches “{query}”. Press Escape to keep typing.
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Insert block"
      className="absolute z-40 mt-1 max-h-[min(18rem,45vh)] w-[min(16rem,calc(100vw-3rem))] overflow-y-auto overscroll-contain rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-1 shadow-lg"
    >
      {matches.map((item, index) => (
        <button
          key={`${item.type}-${item.level ?? 0}`}
          type="button"
          data-index={index}
          role="option"
          aria-selected={index === active}
          // Pointer down, not click: a click fires after blur, by which point
          // the block that opened the menu has lost the caret. On a touch
          // screen the synthesised mouse events can arrive later still, or not
          // at all, so this listens to the pointer directly.
          onPointerDown={(e) => {
            e.preventDefault()
            onPick({ type: item.type, level: item.level })
          }}
          onMouseEnter={() => setActive(index)}
          // Taller rows on touch: 44px is the smallest target a thumb hits
          // reliably, and the desktop density is a third of that.
          className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2.5 text-left transition-colors sm:py-1.5 ${
            index === active ? 'bg-[var(--color-accent-soft)]' : ''
          }`}
        >
          <span className="text-[var(--color-muted)]">{ICONS[item.icon]}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm">{item.label}</span>
            <span className="block truncate text-[11px] text-[var(--color-faint)]">
              {item.hint}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
