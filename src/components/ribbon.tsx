'use client'

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Code,
  Ellipsis,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Paperclip,
  Plus,
  Sparkles,
  Strikethrough,
  Table,
  TextQuote,
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
 * goes to Bold without your eyes going anywhere at all.
 *
 * ## Why it does not look like Word
 *
 * The first version of this did, and looked thirty years old: a native
 * `<select>` with its operating-system chrome, twenty icons of equal weight,
 * and a vertical rule between every group. All three are the things that date
 * a toolbar. So: the style control is a plain button that opens a menu showing
 * each style set in its own type; groups are separated by space rather than by
 * lines; buttons have no borders until you are over them; and everything that
 * is not used in the first minute of writing — alignment, indent, the size of
 * the type — lives behind one "More" button instead of occupying the row.
 *
 * Fewer things on the row is not only fashion. The row has to survive a phone,
 * and a toolbar that wraps onto a second line pushes the page down and moves
 * every control somebody had started to learn the position of.
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
 * `preview` is the class the menu row is set in, so choosing "Heading 1" means
 * pointing at something that looks like a heading rather than reading the
 * words "Heading 1" in the same type as everything else.
 */
const STYLES: Array<{
  value: string
  label: string
  short: string
  preview: string
  type: BlockType
  level?: 1 | 2 | 3
  ordered?: boolean
}> = [
  { value: 'text', label: 'Normal text', short: 'Normal', preview: 'text-[15px]', type: 'text' },
  { value: 'h1', label: 'Heading 1', short: 'H1', preview: 'text-[22px] font-semibold', type: 'heading', level: 1 },
  { value: 'h2', label: 'Heading 2', short: 'H2', preview: 'text-[18px] font-semibold', type: 'heading', level: 2 },
  { value: 'h3', label: 'Heading 3', short: 'H3', preview: 'text-[15px] font-semibold', type: 'heading', level: 3 },
  { value: 'bullet', label: 'Bulleted list', short: 'List', preview: 'text-[15px]', type: 'bullet' },
  { value: 'ordered', label: 'Numbered list', short: 'List', preview: 'text-[15px]', type: 'bullet', ordered: true },
  { value: 'todo', label: 'Task', short: 'Task', preview: 'text-[15px]', type: 'todo' },
  { value: 'quote', label: 'Quote', short: 'Quote', preview: 'text-[15px] italic', type: 'quote' },
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
  { type: 'table', label: 'Spreadsheet', icon: <Table size={15} /> },
  { type: 'code', label: 'Code', icon: <Code size={15} /> },
  { type: 'form', label: 'Form', icon: <ListTodo size={15} /> },
  { type: 'file', label: 'File attachment', icon: <Paperclip size={15} /> },
  { type: 'divider', label: 'Horizontal line', icon: <Minus size={15} /> },
]

const SIZES: Array<{ id: 'medium' | 'large' | 'huge'; label: string }> = [
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
  { id: 'huge', label: 'Huge' },
]

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
  /** Which of the three menus is down. One at a time, like any menu bar. */
  const [menu, setMenu] = useState<'style' | 'insert' | 'more' | null>(null)
  const root = useRef<HTMLDivElement>(null)

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
    if (!menu) return
    /*
      Closed by testing where the press landed, never by stopPropagation.
      Relying on propagation closes the menu on pointerdown and unmounts the
      button before its own click can fire — which is how every item in a menu
      ends up doing nothing. See the same note in doc-list.tsx.
    */
    const close = (event: Event) => {
      const el = event.target as Element | null
      if (el && root.current?.contains(el)) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const align = target?.align ?? 'left'
  const current = STYLES.find((s) => s.value === styleValue(target)) ?? STYLES[0]

  const pickStyle = (style: (typeof STYLES)[number]) => {
    setMenu(null)
    onStyle({ type: style.type, level: style.level, ordered: style.ordered })
  }

  return (
    <div
      ref={root}
      role="toolbar"
      aria-label="Formatting"
      data-print="hide"
      className="sticky top-0 z-20 flex items-center gap-0.5 border-b border-[var(--color-line)] bg-[var(--color-paper)]/95 px-1.5 py-1.5 backdrop-blur sm:px-2"
    >
      {/* ------------------------------------------------------------ style */}
      <div className="relative shrink-0">
        <button
          type="button"
          aria-label="Paragraph style"
          aria-expanded={menu === 'style'}
          onPointerDown={(e) => {
            e.preventDefault()
            setMenu(menu === 'style' ? null : 'style')
          }}
          className="flex h-8 items-center gap-1 rounded-lg px-2 text-[14px] text-[var(--color-ink)] hover:bg-[var(--color-hover)]"
        >
          <span className="hidden sm:inline">{current.label}</span>
          <span className="sm:hidden">{current.short}</span>
          <ChevronDown size={14} className="opacity-50" />
        </button>
        {menu === 'style' && (
          <Menu>
            {STYLES.map((style) => (
              <button
                key={style.value}
                type="button"
                role="menuitem"
                onPointerDown={(e) => {
                  e.preventDefault()
                  pickStyle(style)
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-[var(--color-hover)]"
              >
                <span className={`min-w-0 flex-1 truncate ${style.preview}`}>{style.label}</span>
                {style.value === current.value && (
                  <Check size={14} className="shrink-0 text-[var(--color-accent)]" />
                )}
              </button>
            ))}
          </Menu>
        )}
      </div>

      {/* ------------------------------------------------------------ marks */}
      <span className="ml-1 flex shrink-0 items-center gap-0.5">
        <Tool label="Bold" shortcut="Ctrl+B" active={marks.bold} onRun={() => applyFormat('bold')}>
          <Bold size={15} />
        </Tool>
        <Tool
          label="Italic"
          shortcut="Ctrl+I"
          active={marks.italic}
          onRun={() => applyFormat('italic')}
        >
          <Italic size={15} />
        </Tool>
        {/*
          Underline, strikethrough and code are desktop-width only. On a phone
          they are one press away on the bar that appears over a selection,
          which is where formatting is done with a thumb anyway — and a
          toolbar that wraps to two rows is worse than either.
        */}
        <span className="hidden items-center gap-0.5 sm:flex">
          <Tool
            label="Underline"
            shortcut="Ctrl+U"
            active={marks.underline}
            onRun={() => applyFormat('underline')}
          >
            <Underline size={15} />
          </Tool>
          <Tool label="Strikethrough" active={marks.strike} onRun={() => applyFormat('strike')}>
            <Strikethrough size={15} />
          </Tool>
          <Tool
            label="Inline code"
            shortcut="Ctrl+E"
            active={marks.code}
            onRun={() => applyFormat('code')}
          >
            <Code size={15} />
          </Tool>
        </span>
      </span>

      {/* ------------------------------------------------------------ lists */}
      <span className="ml-1 flex shrink-0 items-center gap-0.5">
        <Tool
          label="Bulleted list"
          active={target?.type === 'bullet' && !target.ordered}
          onRun={() => onStyle({ type: 'bullet' })}
        >
          <List size={15} />
        </Tool>
        <Tool
          label="Numbered list"
          active={target?.type === 'bullet' && !!target.ordered}
          onRun={() => onStyle({ type: 'bullet', ordered: true })}
        >
          <ListOrdered size={15} />
        </Tool>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Tool label="Task" active={target?.type === 'todo'} onRun={() => onStyle({ type: 'todo' })}>
            <ListTodo size={15} />
          </Tool>
          <Tool
            label="Quote"
            active={target?.type === 'quote'}
            onRun={() => onStyle({ type: 'quote' })}
          >
            <TextQuote size={15} />
          </Tool>
        </span>
      </span>

      {/* ----------------------------------------------------------- insert */}
      <div className="relative ml-1 shrink-0">
        <button
          type="button"
          aria-label="Insert"
          aria-expanded={menu === 'insert'}
          onPointerDown={(e) => {
            e.preventDefault()
            setMenu(menu === 'insert' ? null : 'insert')
          }}
          className="flex h-8 items-center gap-1 rounded-lg px-2 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">Insert</span>
          <ChevronDown size={14} className="opacity-50" />
        </button>
        {menu === 'insert' && (
          <Menu>
            {INSERTS.map((item) => (
              <button
                key={item.type}
                type="button"
                role="menuitem"
                onPointerDown={(e) => {
                  e.preventDefault()
                  setMenu(null)
                  onInsert(item.type)
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[14px] hover:bg-[var(--color-hover)]"
              >
                <span className="shrink-0 text-[var(--color-muted)]">{item.icon}</span>
                {item.label}
              </button>
            ))}
            <p className="mt-1 border-t border-[var(--color-line)] px-2.5 pt-2 pb-1 text-[13px] text-[var(--color-faint)]">
              Typing <kbd className="font-mono">/</kbd> in the page does the same.
            </p>
          </Menu>
        )}
      </div>

      {/* ------------------------------------------------------------- more */}
      <div className="relative ml-1 shrink-0">
        <button
          type="button"
          aria-label="More formatting"
          aria-expanded={menu === 'more'}
          onPointerDown={(e) => {
            e.preventDefault()
            setMenu(menu === 'more' ? null : 'more')
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
        >
          <Ellipsis size={16} />
        </button>
        {menu === 'more' && (
          <Menu>
            <Group label="Alignment">
              <Seg label="Align left" active={align === 'left'} onRun={() => onAlign('left')}>
                <AlignLeft size={15} />
              </Seg>
              <Seg label="Align centre" active={align === 'center'} onRun={() => onAlign('center')}>
                <AlignCenter size={15} />
              </Seg>
              <Seg label="Align right" active={align === 'right'} onRun={() => onAlign('right')}>
                <AlignRight size={15} />
              </Seg>
              <Seg label="Justify" active={align === 'justify'} onRun={() => onAlign('justify')}>
                <AlignJustify size={15} />
              </Seg>
            </Group>

            <Group label="Indent">
              <Seg label="Decrease indent" onRun={() => onIndent(-1)}>
                <IndentDecrease size={15} />
              </Seg>
              <Seg label="Increase indent" onRun={() => onIndent(1)}>
                <IndentIncrease size={15} />
              </Seg>
              <span className="flex-1 pl-2 text-[13px] text-[var(--color-faint)]">Tab, Shift+Tab</span>
            </Group>

            {/*
              The size of the type. Named rather than a pair of As: a control
              you press twice to find out what it does is a control you press
              twice every time.
            */}
            <Group label="Size of the text">
              {SIZES.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  aria-pressed={textSize === size.id}
                  aria-label={`${size.label} text`}
                  onPointerDown={(e) => {
                    e.preventDefault()
                    onTextSize(size.id)
                  }}
                  className={`h-8 flex-1 rounded-md text-[14px] transition-colors ${
                    textSize === size.id
                      ? 'bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]'
                      : 'text-[var(--color-muted)] hover:bg-[var(--color-hover)]'
                  }`}
                >
                  {size.label}
                </button>
              ))}
            </Group>
          </Menu>
        )}
      </div>

      {/*
        Writing help, and the only way to it without a keyboard.

        Always on the row, at every width — Ctrl+J does not exist on a phone,
        and a feature reachable only by a shortcut is a feature half the people
        using this will never find.
      */}
      {onAssist && (
        <button
          type="button"
          aria-label="Writing help"
          title="Writing help (Ctrl+J)"
          onPointerDown={(e) => {
            e.preventDefault()
            onAssist()
          }}
          className="ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-accent-soft)] px-2.5 text-[14px] font-medium text-[var(--color-accent)] hover:opacity-85"
        >
          <Sparkles size={15} />
          Ask
          <kbd className="hidden text-[12px] font-normal opacity-60 md:inline">Ctrl J</kbd>
        </button>
      )}
    </div>
  )
}

/** The panel a toolbar button drops. One shape, so they all behave the same. */
function Menu({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="menu"
      // Full width on a phone, where a panel hanging off a button near the
      // right-hand edge is half off the side of the screen.
      className="fixed inset-x-2 top-14 z-50 max-h-[70dvh] overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-1 shadow-2xl sm:absolute sm:inset-x-auto sm:top-full sm:left-0 sm:mt-1 sm:w-60"
    >
      {children}
    </div>
  )
}

/** A labelled row of controls inside the More menu. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-1.5 pt-1.5 pb-1">
      <p className="px-1 pb-1 text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
        {label}
      </p>
      <div className="flex items-center gap-0.5">{children}</div>
    </div>
  )
}

function Seg({
  label,
  active,
  onRun,
  children,
}: {
  label: string
  active?: boolean
  onRun: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onPointerDown={(e) => {
        e.preventDefault()
        onRun()
      }}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
        active
          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
          : 'text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]'
      }`}
    >
      {children}
    </button>
  )
}

function Tool({
  label,
  shortcut,
  active,
  onRun,
  children,
}: {
  label: string
  shortcut?: string
  active?: boolean
  onRun: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      // Pointer down with preventDefault, never click: a click blurs the
      // block first and the command has nothing left to act on.
      onPointerDown={(e) => {
        e.preventDefault()
        onRun()
      }}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
        active
          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
          : 'text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]'
      }`}
    >
      {children}
    </button>
  )
}
