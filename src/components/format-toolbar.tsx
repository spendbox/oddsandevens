'use client'

import { Bold, Code, Italic, Strikethrough } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

/**
 * The formatting bar that appears over a selection.
 *
 * One instance for the whole editor, driven by `selectionchange`, rather than
 * one per block: blocks are cheap but document-level listeners are not, and a
 * page with three hundred paragraphs should not install three hundred of them.
 *
 * It matters most on a phone. A keyboard has Ctrl+B; a thumb has nothing, and
 * the operating system's own selection menu offers copy and paste but never
 * bold. Without this, formatting would be a desktop-only feature.
 */
export default function FormatToolbar({ scope }: { scope: React.RefObject<HTMLElement | null> }) {
  const [box, setBox] = useState<{ top: number; left: number } | null>(null)
  const [marks, setMarks] = useState({ bold: false, italic: false, strike: false, code: false })

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
      aria-label="Formatting"
      // Fixed, because the coordinates come from getBoundingClientRect, which
      // is already relative to the viewport.
      style={{ top: Math.max(8, box.top - 44), left: box.left }}
      className="fixed z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-1 shadow-lg"
    >
      <Mark label="Bold" active={marks.bold} onRun={() => applyFormat('bold')}>
        <Bold size={14} />
      </Mark>
      <Mark label="Italic" active={marks.italic} onRun={() => applyFormat('italic')}>
        <Italic size={14} />
      </Mark>
      <Mark label="Strikethrough" active={marks.strike} onRun={() => applyFormat('strike')}>
        <Strikethrough size={14} />
      </Mark>
      <Mark label="Code" active={marks.code} onRun={() => applyFormat('code')}>
        <Code size={14} />
      </Mark>
    </div>
  )
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
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
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
