'use client'

import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Strikethrough,
  TextQuote,
  Underline,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { BlockType } from '@/lib/types'

/**
 * The formatting bar, and the only one this app has.
 *
 * ## Why it appears rather than sits there
 *
 * Because a bar of twenty controls across the top of a page somebody opened to
 * write on is furniture: it is in the way on every line they type and it is
 * useful on about one in fifty. Formatting is something you do to words you
 * have already written and just selected — so it arrives with the selection,
 * over the words it will act on, and leaves with it. Nothing is lost: every
 * mark here is also a keyboard shortcut, and every line style here is also
 * something you can type ("# ", "- ", "[] ").
 *
 * ## How it is wired
 *
 * One instance for the whole editor, driven by `selectionchange`, rather than
 * one per block: blocks are cheap and document-level listeners are not.
 *
 * The marks act on the selection through `execCommand`, which is deprecated
 * and is still the only API that edits a contenteditable while keeping the
 * browser's own undo stack. The line styles cannot: a paragraph's *kind* is a
 * property of the block, not of the characters, so those are handed up and
 * applied to the note the same way typing "# " is.
 *
 * It matters most on a phone. A keyboard has Ctrl+B; a thumb has nothing, and
 * the operating system's own selection menu offers copy and paste but never
 * bold.
 */
export interface StyleChoice {
  type: BlockType
  level?: 1 | 2 | 3
  ordered?: boolean
}

export default function FormatToolbar({
  scope,
  target,
  onStyle,
}: {
  scope: React.RefObject<HTMLElement | null>
  /** What kind of line the caret is in, so a pressed style reads as pressed. */
  target: StyleChoice | null
  /** Changes the kind of the line the selection is in. */
  onStyle: (choice: StyleChoice) => void
}) {
  const [box, setBox] = useState<{ top: number; left: number } | null>(null)
  const [marks, setMarks] = useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    code: false,
  })

  const refresh = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return setBox(null)

    const range = selection.getRangeAt(0)
    const host = range.commonAncestorContainer
    const el = host.nodeType === Node.ELEMENT_NODE ? (host as Element) : host.parentElement
    // Only inside this editor, and only inside an editable block — a selection
    // in the sidebar or a spreadsheet cell is not something to embolden.
    if (!el || !scope.current?.contains(el) || !el.closest('[contenteditable]')) {
      return setBox(null)
    }

    const rect = range.getBoundingClientRect()
    if (!rect.width && !rect.height) return setBox(null)

    setMarks({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike: document.queryCommandState('strikeThrough'),
      code: !!el.closest('code'),
    })
    setBox({ top: rect.top, left: rect.left + rect.width / 2 })
  }, [scope])

  useEffect(() => {
    // selectionchange is the only event that fires for every way a selection
    // can change: drag, shift-arrow, double-click, and the handles on a phone.
    document.addEventListener('selectionchange', refresh)
    window.addEventListener('scroll', refresh, true)
    window.addEventListener('resize', refresh)
    return () => {
      document.removeEventListener('selectionchange', refresh)
      window.removeEventListener('scroll', refresh, true)
      window.removeEventListener('resize', refresh)
    }
  }, [refresh])

  if (!box) return null

  return (
    <div
      role="toolbar"
      // Named apart from the toolbar above the page: two controls called
      // "Formatting" is ambiguous to a screen reader and to a test alike.
      aria-label="Selection formatting"
      // Fixed, because the coordinates come from getBoundingClientRect, which
      // is already relative to the viewport.
      /*
        Kept on the screen. Centring it on the selection is right until the
        selection is near an edge, where half the bar ends up outside the
        window — so the centre is clamped to half a bar's width from either
        side. The width is the eleven controls below at 28px plus the padding.
      */
      style={{ top: Math.max(8, box.top - 46), left: clamp(box.left) }}
      className="fixed z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-1 shadow-lg"
    >
      <Mark label="Bold" active={marks.bold} onRun={() => applyFormat('bold')}>
        <Bold size={14} />
      </Mark>
      <Mark label="Italic" active={marks.italic} onRun={() => applyFormat('italic')}>
        <Italic size={14} />
      </Mark>
      <Mark label="Underline" active={marks.underline} onRun={() => applyFormat('underline')}>
        <Underline size={14} />
      </Mark>
      <Mark label="Strikethrough" active={marks.strike} onRun={() => applyFormat('strike')}>
        <Strikethrough size={14} />
      </Mark>
      <Mark label="Inline code" active={marks.code} onRun={() => applyFormat('code')}>
        <Code size={14} />
      </Mark>

      <span aria-hidden className="mx-0.5 h-5 w-px bg-[var(--color-line)]" />

      {/*
        What kind of line this is. A heading, a list, a thing to tick, a quote
        — the five shapes a note is made of, and the same five the beautifier
        produces from "# ", "- ", "1. ", "[] " and "> ".
      */}
      <Mark
        label="Heading"
        active={target?.type === 'heading' && target.level === 1}
        onRun={() => onStyle(headingToggle(target, 1))}
      >
        <Heading1 size={14} />
      </Mark>
      <Mark
        label="Smaller heading"
        active={target?.type === 'heading' && target.level === 2}
        onRun={() => onStyle(headingToggle(target, 2))}
      >
        <Heading2 size={14} />
      </Mark>
      <Mark
        label="Bulleted list"
        active={target?.type === 'bullet' && !target.ordered}
        onRun={() =>
          onStyle(
            target?.type === 'bullet' && !target.ordered
              ? { type: 'text' }
              : { type: 'bullet' },
          )
        }
      >
        <List size={14} />
      </Mark>
      <Mark
        label="Numbered list"
        active={target?.type === 'bullet' && !!target.ordered}
        onRun={() =>
          onStyle(
            target?.type === 'bullet' && target.ordered
              ? { type: 'text' }
              : { type: 'bullet', ordered: true },
          )
        }
      >
        <ListOrdered size={14} />
      </Mark>
      <Mark
        label="Box to tick"
        active={target?.type === 'todo'}
        onRun={() => onStyle(target?.type === 'todo' ? { type: 'text' } : { type: 'todo' })}
      >
        <ListTodo size={14} />
      </Mark>
      <Mark
        label="Quote"
        active={target?.type === 'quote'}
        onRun={() => onStyle(target?.type === 'quote' ? { type: 'text' } : { type: 'quote' })}
      >
        <TextQuote size={14} />
      </Mark>
    </div>
  )
}

/** Pressing the heading a line already is turns it back into a paragraph. */
function headingToggle(target: StyleChoice | null, level: 1 | 2): StyleChoice {
  const already = target?.type === 'heading' && target.level === level
  return already ? { type: 'text' } : { type: 'heading', level }
}

/** Half the bar's width, so neither end can leave the window. */
const HALF_BAR = 170

function clamp(left: number): number {
  const width = typeof window === 'undefined' ? 0 : window.innerWidth
  if (!width) return left
  return Math.min(Math.max(left, HALF_BAR + 4), width - HALF_BAR - 4)
}

function Mark({
  label,
  active,
  onRun,
  children,
}: {
  label: string
  active: boolean
  onRun: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      // Pointer down with preventDefault: a click would blur the block first,
      // and a formatting command with no selection left to act on does nothing.
      onPointerDown={(e) => {
        e.preventDefault()
        onRun()
      }}
      className={`flex h-8 w-7 items-center justify-center rounded-md transition-colors ${
        active
          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
          : 'text-[var(--color-muted)] hover:bg-[var(--color-hover)]'
      }`}
    >
      {children}
    </button>
  )
}

export type FormatCommand = 'bold' | 'italic' | 'underline' | 'strike' | 'code'

/**
 * Applies a formatting command to the current selection.
 *
 * execCommand is deprecated and still the only API that edits a contenteditable
 * while keeping the browser's own undo stack intact. Reimplementing it with
 * Range surgery would work but would give the block an undo history that
 * Ctrl+Z no longer understands, which is a worse trade than the deprecation.
 */
export function applyFormat(command: FormatCommand): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const host = selection.getRangeAt(0).commonAncestorContainer
  const el = host.nodeType === Node.ELEMENT_NODE ? (host as Element) : host.parentElement
  const block = el?.closest<HTMLElement>('[contenteditable]')
  if (!block) return

  if (command === 'code') {
    const existing = el?.closest('code')
    if (existing) {
      // Toggling off: unwrap by replacing the element with its own text.
      existing.replaceWith(...Array.from(existing.childNodes))
    } else {
      const text = selection.toString()
      if (!text) return
      document.execCommand(
        'insertHTML',
        false,
        `<code>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`,
      )
    }
  } else {
    document.execCommand(
      command === 'strike' ? 'strikeThrough' : command,
      false,
    )
  }

  // execCommand does not reliably fire `input` in every browser, and that
  // event is what tells the editor there is something new to save.
  block.dispatchEvent(new InputEvent('input', { bubbles: true }))
}
