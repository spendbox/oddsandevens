'use client'

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
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
  Redo2,
  ListChecks,
  Strikethrough,
  Table,
  TextQuote,
  Underline,
  Undo2,
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
 * ## Why there are four buttons on it
 *
 * It had twenty. Undo, redo, a style menu, five marks, four lists, Insert,
 * More and Ask — all correct, all reachable, and collectively a band of grey
 * furniture across the top of every page somebody opened to write on. So it is
 * down to what is worth permanent room: undo, redo, ⋯ and one action button.
 * Everything else moved one press away into the ⋯ menu, and the formatting
 * people reach for most is already on the bar that appears over a selection,
 * which is where a word processor has put its mini toolbar for twenty years.
 *
 * The last slot has held three different things. It was a sparkle in the
 * corner, then Ask, then Ask beside Brain — and every version of it was a way
 * of rewriting the sentence somebody was in the middle of. What is there now
 * is the one thing a page of notes is actually for: reading it back and saying
 * what happens next. Nothing else on this bar talks to a model.
 *
 * Nothing became unreachable. That is the line: a quieter toolbar is worth a
 * press, and is not worth a feature.
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
  /** Reads the document back and shows what to do next. Never runs on its own. */
  onPlan: () => void
  textSize: 'medium' | 'large' | 'huge'
  onTextSize: (next: 'medium' | 'large' | 'huge') => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

/** The paragraph styles, in the order a style menu has listed them since 1990. */
const STYLES: Array<{
  value: string
  label: string
  type: BlockType
  level?: 1 | 2 | 3
  ordered?: boolean
}> = [
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
  onPlan,
  textSize,
  onTextSize,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: RibbonProps) {
  const [marks, setMarks] = useState({
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    code: false,
  })
  /** Whether the one menu is down. */
  const [menu, setMenu] = useState<'more' | null>(null)
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
      ends up doing nothing. See the same note in library-view.tsx.
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
  return (
    <div
      ref={root}
      role="toolbar"
      aria-label="Formatting"
      data-print="hide"
      // Opaque, not 95% with a blur behind it: the page scrolls underneath
      // this and the words showed through, which on a bar that never moves
      // reads as a rendering fault rather than as a material.
      className="sticky top-0 z-20 flex items-center gap-0.5 rounded-t-lg border-b border-[var(--color-line)] bg-[var(--color-paper)] px-1.5 py-1.5 sm:px-2"
    >
      {/*
        Undo and redo, first, which is where they have been in every editor
        since they existed. See lib/history.ts for why the browser's own undo
        could not do this: it keeps a stack per paragraph, and knows nothing
        about a split, a delete or a rewrite applied to the whole page.
      */}
      <Tool label="Undo" shortcut="Ctrl+Z" disabled={!canUndo} onRun={onUndo}>
        <Undo2 size={15} />
      </Tool>
      <Tool label="Redo" shortcut="Ctrl+Shift+Z" disabled={!canRedo} onRun={onRedo}>
        <Redo2 size={15} />
      </Tool>

      {/* --------------------------------------------------------- everything */}
      <div className="relative ml-1 shrink-0">
        <button
          type="button"
          aria-label="Formatting and insert"
          aria-expanded={menu === 'more'}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setMenu(menu === 'more' ? null : 'more')}
          className="flex h-8 items-center gap-1 rounded-lg px-2 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
        >
          <Ellipsis size={16} />
          <ChevronDown size={13} className="opacity-50" />
        </button>
        {menu === 'more' && (
          <Menu>
            <Group label="Style">
              <select
                aria-label="Paragraph style"
                value={styleValue(target)}
                onChange={(e) => {
                  const chosen = STYLES.find((style) => style.value === e.target.value)
                  if (chosen) {
                    setMenu(null)
                    onStyle({ type: chosen.type, level: chosen.level, ordered: chosen.ordered })
                  }
                }}
                className="h-8 w-full rounded-md border border-[var(--color-line)] bg-transparent px-1.5 text-[14px] outline-none"
              >
                {STYLES.map((style) => (
                  <option key={style.value} value={style.value}>
                    {style.label}
                  </option>
                ))}
              </select>
            </Group>

            <Group label="Marks">
              <Seg label="Bold" active={marks.bold} onRun={() => applyFormat('bold')}>
                <Bold size={15} />
              </Seg>
              <Seg label="Italic" active={marks.italic} onRun={() => applyFormat('italic')}>
                <Italic size={15} />
              </Seg>
              <Seg label="Underline" active={marks.underline} onRun={() => applyFormat('underline')}>
                <Underline size={15} />
              </Seg>
              <Seg label="Strikethrough" active={marks.strike} onRun={() => applyFormat('strike')}>
                <Strikethrough size={15} />
              </Seg>
              <Seg label="Inline code" active={marks.code} onRun={() => applyFormat('code')}>
                <Code size={15} />
              </Seg>
            </Group>

            <Group label="Lists">
              <Seg
                label="Bulleted list"
                active={target?.type === 'bullet' && !target.ordered}
                onRun={() => onStyle({ type: 'bullet' })}
              >
                <List size={15} />
              </Seg>
              <Seg
                label="Numbered list"
                active={target?.type === 'bullet' && !!target.ordered}
                onRun={() => onStyle({ type: 'bullet', ordered: true })}
              >
                <ListOrdered size={15} />
              </Seg>
              <Seg label="Task" active={target?.type === 'todo'} onRun={() => onStyle({ type: 'todo' })}>
                <ListTodo size={15} />
              </Seg>
              <Seg
                label="Quote"
                active={target?.type === 'quote'}
                onRun={() => onStyle({ type: 'quote' })}
              >
                <TextQuote size={15} />
              </Seg>
            </Group>

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
              <Seg label="Decrease indent" onRun={() => onIndent(-1)}>
                <IndentDecrease size={15} />
              </Seg>
              <Seg label="Increase indent" onRun={() => onIndent(1)}>
                <IndentIncrease size={15} />
              </Seg>
            </Group>

            <Group label="Size of the text">
              {SIZES.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  aria-pressed={textSize === size.id}
                  aria-label={`${size.label} text`}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => onTextSize(size.id)}
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

            <div className="my-1 h-px bg-[var(--color-line)]" />

            {INSERTS.map((item) => (
              <button
                key={item.type}
                type="button"
                role="menuitem"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  setMenu(null)
                  onInsert(item.type)
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[14px] hover:bg-[var(--color-hover)]"
              >
                <span className="shrink-0 text-[var(--color-muted)]">{item.icon}</span>
                Insert {item.label.toLowerCase()}
              </button>
            ))}

          </Menu>
        )}
      </div>

      <div className="ml-auto" />

      {/*
        The action button, and the only thing on this bar that reads the page.

        Always on the row, at every width: the plan is the one thing here that
        is not formatting, and a feature reachable only through a menu is a
        feature half the people using this will never find. It never runs on
        its own — a plan appears because somebody asked for one.
      */}
      <button
        type="button"
        aria-label="What to do next"
        title="Read this back and say what happens next"
        /*
          Prevent the default on pointerdown so the block keeps its selection,
          but act on click.

          Acting on pointerdown is what made this need a long press on a phone:
          the panel rendered its backdrop under the finger that was still down,
          and the click that completed the tap landed on the backdrop and
          closed it again. A press only looked like it worked if it was held
          long enough for the browser to drop the click.
        */
        onPointerDown={(e) => e.preventDefault()}
        onClick={onPlan}
        className="ml-1 flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-accent-soft)] px-2.5 text-[14px] font-medium text-[var(--color-accent)] hover:opacity-85"
      >
        <ListChecks size={15} />
        Actions
      </button>
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
      // block first and the command has nothing left to act on. These act
      // immediately and open nothing, so acting here is safe — see the note on
      // the Ask button for the case where it is not.
      onPointerDown={(e) => {
        e.preventDefault()
        if (!disabled) onRun()
      }}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${
        active
          ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
          : 'text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]'
      }`}
    >
      {children}
    </button>
  )
}
