'use client'

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Paperclip,
  Sparkles,
  Strikethrough,
  Table,
  TextQuote,
  Type,
  Underline,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Align, BlockType } from '@/lib/types'
import { applyFormat } from './format-toolbar'

/**
 * The toolbar above the page.
 *
 * ## Why a word processor has one and a block editor does not
 *
 * A block editor hides its controls until you hover the thing they act on,
 * which is elegant in a screenshot and unhelpful in use: you cannot see what
 * the application can do without waving the pointer over the document, and the
 * controls move as the pointer moves. A word processor puts them in one fixed
 * place, always visible, always in the same order — so after a week your hand
 * goes to Bold without your eyes going anywhere at all. That is the whole
 * trade, and for something people type into for hours it is the right one.
 *
 * ## Why the marks are read from the selection rather than from the block
 *
 * Bold is a property of a run of characters, not of a paragraph, so the only
 * honest source for "is the caret in bold text" is the selection itself. One
 * `selectionchange` listener for the whole editor, as in format-toolbar.tsx,
 * rather than one per block: blocks are cheap and document listeners are not.
 *
 * ## Why every button is pointerdown with preventDefault
 *
 * A click blurs the block first, and a formatting command with no selection
 * left to act on does nothing at all. This is the single most common way a
 * toolbar over a contenteditable ends up silently broken.
 */

/** What the caret is currently sitting in, as far as these controls care. */
export interface RibbonTarget {
  type: BlockType
  level?: 1 | 2 | 3
  align?: Align
  ordered?: boolean
  indent?: number
}

export interface RibbonProps {
  /** Null when the caret is not in a paragraph these controls can act on. */
  target: RibbonTarget | null
  /** Change what kind of paragraph this is: heading, list item, quote, text. */
  onStyle: (choice: { type: BlockType; level?: 1 | 2 | 3; ordered?: boolean }) => void
  onAlign: (align: Align) => void
  onIndent: (by: -1 | 1) => void
  /** Insert a block that is not a paragraph: a table, some code, a form. */
  onInsert: (type: BlockType) => void
  /** Open the writing assistant. Absent when no key is configured. */
  onAssist?: () => void
  textSize: 'medium' | 'large' | 'huge'
  onTextSize: (next: 'medium' | 'large' | 'huge') => void
}

/**
 * The paragraph styles, in the order a style menu has listed them since 1990.
 *
 * `value` is what the select carries; it is parsed back rather than held as an
 * object, because a select's value is a string and pretending otherwise means
 * keeping a lookup table in step with the options beside it.
 */
const STYLES: Array<{ value: string; label: string; type: BlockType; level?: 1 | 2 | 3; ordered?: boolean }> = [
  { value: 'text', label: 'Normal text', type: 'text' },
  { value: 'h1', label: 'Heading 1', type: 'heading', level: 1 },
  { value: 'h2', label: 'Heading 2', type: 'heading', level: 2 },
  { value: 'h3', label: 'Heading 3', type: 'heading', level: 3 },
  { value: 'bullet', label: 'Bulleted list', type: 'bullet' },
  { value: 'ordered', label: 'Numbered list', type: 'bullet', ordered: true },
  { value: 'todo', label: 'Task', type: 'todo' },
  { value: 'quote', label: 'Quote', type: 'quote' },
]

function styleValue(target: RibbonTarget | null): string {
  if (!target) return 'text'
  if (target.type === 'heading') return `h${target.level ?? 1}`
  if (target.type === 'bullet') return target.ordered ? 'ordered' : 'bullet'
  if (target.type === 'todo') return 'todo'
  if (target.type === 'quote') return 'quote'
  return 'text'
}

const INSERTS: Array<{ type: BlockType; label: string; icon: React.ReactNode }> = [
  { type: 'table', label: 'Spreadsheet', icon: <Table size={14} /> },
  { type: 'code', label: 'Code', icon: <Code size={14} /> },
  { type: 'form', label: 'Form', icon: <ListTodo size={14} /> },
  { type: 'file', label: 'File attachment', icon: <Paperclip size={14} /> },
  { type: 'divider', label: 'Horizontal line', icon: <Minus size={14} /> },
]

const SIZES = ['medium', 'large', 'huge'] as const

export default function Ribbon({
  target,
  onStyle,
  onAlign,
  onIndent,
  onInsert,
  onAssist,
  textSize,
  onTextSize,
}: RibbonProps) {
  const [marks, setMarks] = useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    code: false,
  })
  const [insertOpen, setInsertOpen] = useState(false)
  const insertRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const host = selection.getRangeAt(0).commonAncestorContainer
    const el = host.nodeType === Node.ELEMENT_NODE ? (host as Element) : host.parentElement
    if (!el?.closest('[contenteditable]')) return
    setMarks({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike: document.queryCommandState('strikeThrough'),
      code: !!el.closest('code'),
    })
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', refresh)
    return () => document.removeEventListener('selectionchange', refresh)
  }, [refresh])

  useEffect(() => {
    if (!insertOpen) return
    /*
      Closed by testing where the press landed, never by stopPropagation.
      Relying on propagation closes the menu on pointerdown and unmounts the
      button before its own click can fire — which is how every item in a menu
      ends up doing nothing. See the same note in doc-list.tsx.
    */
    const close = (event: Event) => {
      const el = event.target as Element | null
      if (el && insertRef.current?.contains(el)) return
      setInsertOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [insertOpen])

  const align = target?.align ?? 'left'
  const sizeAt = SIZES.indexOf(textSize)

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      data-print="hide"
      className="sticky top-0 z-20 flex flex-wrap items-center gap-0.5 border-b border-[var(--color-line)] bg-[var(--color-paper)]/95 px-2 py-1.5 backdrop-blur"
    >
      {/*
        A real select, not a custom menu. It is the one control here that has
        to work with a keyboard, a screen reader and a thumb on a small screen
        without any of that being written by hand, and the operating system's
        own version of it is better than anything worth building again.
      */}
      <select
        aria-label="Paragraph style"
        value={styleValue(target)}
        onChange={(e) => {
          const chosen = STYLES.find((s) => s.value === e.target.value)
          if (chosen) onStyle({ type: chosen.type, level: chosen.level, ordered: chosen.ordered })
        }}
        className="mr-0.5 h-7 max-w-[8.5rem] min-w-0 rounded-md border border-[var(--color-line)] bg-transparent px-1 text-[13px] outline-none hover:bg-[var(--color-hover)]"
      >
        {STYLES.map((style) => (
          <option key={style.value} value={style.value}>
            {style.label}
          </option>
        ))}
      </select>

      <Divider />

      <Tool label="Bold" shortcut="Ctrl+B" active={marks.bold} onRun={() => applyFormat('bold')}>
        <Bold size={14} />
      </Tool>
      <Tool label="Italic" shortcut="Ctrl+I" active={marks.italic} onRun={() => applyFormat('italic')}>
        <Italic size={14} />
      </Tool>
      <Tool
        label="Underline"
        shortcut="Ctrl+U"
        active={marks.underline}
        onRun={() => applyFormat('underline')}
      >
        <Underline size={14} />
      </Tool>
      <Tool label="Strikethrough" active={marks.strike} onRun={() => applyFormat('strike')}>
        <Strikethrough size={14} />
      </Tool>
      <Tool label="Inline code" shortcut="Ctrl+E" active={marks.code} onRun={() => applyFormat('code')}>
        <Code size={14} />
      </Tool>

      <Divider />

      <Tool
        label="Bulleted list"
        active={target?.type === 'bullet' && !target.ordered}
        onRun={() => onStyle({ type: 'bullet' })}
      >
        <List size={14} />
      </Tool>
      <Tool
        label="Numbered list"
        active={target?.type === 'bullet' && !!target.ordered}
        onRun={() => onStyle({ type: 'bullet', ordered: true })}
      >
        <ListOrdered size={14} />
      </Tool>
      <Tool label="Task" active={target?.type === 'todo'} onRun={() => onStyle({ type: 'todo' })}>
        <ListTodo size={14} />
      </Tool>
      <Tool label="Quote" active={target?.type === 'quote'} onRun={() => onStyle({ type: 'quote' })}>
        <TextQuote size={14} />
      </Tool>

      {/*
        Indent and alignment are hidden on a narrow screen rather than left to
        wrap onto a second row. A toolbar that grows a line when the window
        shrinks pushes the page down and moves every control somebody had
        started to learn the position of; Tab and Shift+Tab still indent, which
        is how most people do it anyway.
      */}
      <span className="hidden shrink-0 items-center gap-0.5 sm:flex">
        <Divider />
        <Tool label="Decrease indent" shortcut="Shift+Tab" onRun={() => onIndent(-1)}>
          <IndentDecrease size={14} />
        </Tool>
        <Tool label="Increase indent" shortcut="Tab" onRun={() => onIndent(1)}>
          <IndentIncrease size={14} />
        </Tool>
        <Divider />
        <Tool label="Align left" active={align === 'left'} onRun={() => onAlign('left')}>
          <AlignLeft size={14} />
        </Tool>
        <Tool label="Align centre" active={align === 'center'} onRun={() => onAlign('center')}>
          <AlignCenter size={14} />
        </Tool>
        <Tool label="Align right" active={align === 'right'} onRun={() => onAlign('right')}>
          <AlignRight size={14} />
        </Tool>
        <Tool label="Justify" active={align === 'justify'} onRun={() => onAlign('justify')}>
          <AlignJustify size={14} />
        </Tool>
      </span>

      <Divider />

      {/* The size control people actually asked for, one press per step. */}
      <Tool
        label="Smaller text"
        disabled={sizeAt <= 0}
        onRun={() => onTextSize(SIZES[Math.max(0, sizeAt - 1)])}
      >
        <span className="text-[11px] font-semibold">A</span>
      </Tool>
      <Tool
        label="Larger text"
        disabled={sizeAt >= SIZES.length - 1}
        onRun={() => onTextSize(SIZES[Math.min(SIZES.length - 1, sizeAt + 1)])}
      >
        <span className="text-[16px] font-semibold">A</span>
      </Tool>

      <Divider />

      <div ref={insertRef} className="relative">
        <button
          type="button"
          aria-label="Insert"
          aria-expanded={insertOpen}
          onPointerDown={(e) => {
            e.preventDefault()
            setInsertOpen((open) => !open)
          }}
          className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
        >
          <Type size={14} />
          Insert
          <ChevronDown size={13} />
        </button>
        {insertOpen && (
          <div
            role="menu"
            className="absolute left-0 z-50 mt-1 w-52 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-1 shadow-lg"
          >
            {INSERTS.map((item) => (
              <button
                key={item.type}
                type="button"
                role="menuitem"
                onPointerDown={(e) => {
                  e.preventDefault()
                  setInsertOpen(false)
                  onInsert(item.type)
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[14px] hover:bg-[var(--color-hover)]"
              >
                <span className="shrink-0 text-[var(--color-muted)]">{item.icon}</span>
                {item.label}
              </button>
            ))}
            <p className="border-t border-[var(--color-line)] px-2.5 pt-1.5 pb-1 text-[13px] text-[var(--color-faint)]">
              Typing <kbd className="font-mono">/</kbd> in the page does the same.
            </p>
          </div>
        )}
      </div>

      {onAssist && (
        <button
          type="button"
          aria-label="Writing help"
          title="Writing help (Ctrl+J)"
          onPointerDown={(e) => {
            e.preventDefault()
            onAssist()
          }}
          className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-line)] px-2 text-[14px] text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
        >
          <Sparkles size={14} />
          <span className="hidden sm:inline">Ask</span>
          <kbd className="hidden text-[12px] text-[var(--color-faint)] md:inline">Ctrl J</kbd>
        </button>
      )}
    </div>
  )
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-[var(--color-line)]" />
}

function Tool({
  label,
  shortcut,
  active,
  disabled,
  onRun,
  children,
}: {
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onRun: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      // Pointer down with preventDefault, never click: a click blurs the
      // block first and the command has nothing left to act on.
      onPointerDown={(e) => {
        e.preventDefault()
        if (!disabled) onRun()
      }}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-30 ${
        active
          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
          : 'text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]'
      }`}
    >
      {children}
    </button>
  )
}
