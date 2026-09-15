'use client'

import { GripVertical, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { makeBlock, shortcutFor } from '@/lib/blocks'
import type { Block, Doc, TextishBlock } from '@/lib/types'
import { isTextish } from '@/lib/types'
import CodeBlock from './code-block'
import Editable, { placeCaret } from './editable'
import FormBlock from './form-block'
import SlashMenu, { type SlashChoice } from './slash-menu'
import TableBlock from './table-block'

/**
 * The document editor.
 *
 * It owns block structure — creating, splitting, merging, deleting and
 * focusing — and hands the inside of each block to a component that knows
 * that block type. Keeping structure in one place is what lets Enter,
 * Backspace and the slash menu behave identically no matter which kind of
 * block the caret happens to be in.
 */
export default function Editor({
  doc,
  onChange,
}: {
  doc: Doc
  onChange: (next: Doc) => void
}) {
  /**
   * Which block to put the caret in after the next render, and where.
   *
   * The initial value is the app's whole opening promise: a document with
   * nothing in it gets the caret straight away, so the first thing a new
   * visitor does can be typing rather than hunting for where to click. A
   * document that already has content is left alone — stealing the caret
   * would scroll someone away from what they came back to read.
   */
  const [focus, setFocus] = useState<{ id: string; caret: 'start' | 'end' | number } | null>(
    () => {
      const only = doc.blocks.length === 1 ? doc.blocks[0] : null
      const isBlank = !doc.title.trim() && only && isTextish(only) && !only.text
      return isBlank && only ? { id: only.id, caret: 'start' as const } : null
    },
  )
  /** Open slash menu: which block it belongs to and where the "/" sits. */
  const [slash, setSlash] = useState<{ id: string; at: number; query: string } | null>(null)
  const container = useRef<HTMLDivElement>(null)

  const setBlocks = useCallback(
    (blocks: Block[]) => onChange({ ...doc, blocks, updatedAt: Date.now() }),
    [doc, onChange],
  )

  const updateBlock = useCallback(
    (id: string, next: Block) => setBlocks(doc.blocks.map((b) => (b.id === id ? next : b))),
    [doc.blocks, setBlocks],
  )

  // Focus is applied after render, by finding the block in the DOM. It cannot
  // be a prop on the editable, because that only takes effect on mount and
  // most focus moves here are to a block that is already mounted.
  useEffect(() => {
    if (!focus) return
    const host = container.current?.querySelector<HTMLElement>(`[data-block-id="${focus.id}"]`)
    const el =
      host?.querySelector<HTMLElement>('[contenteditable]') ??
      host?.querySelector<HTMLElement>('textarea, input')
    if (!el) return
    el.focus()
    if (el.isContentEditable) {
      const length = el.textContent?.length ?? 0
      placeCaret(el, focus.caret === 'start' ? 0 : focus.caret === 'end' ? length : focus.caret)
    }
    setFocus(null)
  }, [focus, doc.blocks])

  const indexOf = (id: string) => doc.blocks.findIndex((b) => b.id === id)

  /** Inserts after `id` and puts the caret in the new block. */
  const insertAfter = (id: string, block: Block) => {
    const index = indexOf(id)
    const next = [...doc.blocks]
    next.splice(index + 1, 0, block)
    setBlocks(next)
    setFocus({ id: block.id, caret: 'start' })
  }

  const removeBlock = (id: string) => {
    const index = indexOf(id)
    if (doc.blocks.length === 1) {
      // Never leave a document with nothing to type into.
      const fresh = makeBlock('text')
      setBlocks([fresh])
      setFocus({ id: fresh.id, caret: 'start' })
      return
    }
    const next = doc.blocks.filter((b) => b.id !== id)
    setBlocks(next)
    const before = next[Math.max(0, index - 1)]
    if (before) setFocus({ id: before.id, caret: 'end' })
  }

  /** Replaces a block with a new one of another type, carrying text across. */
  const convert = (id: string, choice: SlashChoice, keepText: string) => {
    const created = makeBlock(choice.type, choice.level)
    if (isTextish(created) && keepText) created.text = keepText
    if (created.type === 'todo' && keepText) created.text = keepText
    setBlocks(doc.blocks.map((b) => (b.id === id ? created : b)))
    setFocus({ id: created.id, caret: 'end' })
  }

  const pickFromSlash = (choice: SlashChoice) => {
    if (!slash) return
    const block = doc.blocks.find((b) => b.id === slash.id)
    setSlash(null)
    if (!block) return

    const text = isTextish(block) || block.type === 'todo' ? block.text : ''
    // Strip the "/query" the user typed to summon the menu.
    const cleaned = text.slice(0, slash.at) + text.slice(slash.at + 1 + slash.query.length)

    if (cleaned.trim() === '') {
      convert(block.id, choice, '')
    } else {
      // There was real text here, so keep it and put the new block below.
      updateBlock(block.id, { ...block, text: cleaned } as Block)
      insertAfter(block.id, makeBlock(choice.type, choice.level))
    }
  }

  /** Text typed into a text-ish or todo block. Handles markdown shortcuts. */
  const onTextChange = (block: TextishBlock | Extract<Block, { type: 'todo' }>, value: string) => {
    const shortcut = shortcutFor(value)
    if (shortcut) {
      if (shortcut.type === 'divider') {
        // A divider has nothing to type into, so leave a fresh block after it.
        const index = indexOf(block.id)
        const next = [...doc.blocks]
        const fresh = makeBlock('text')
        next.splice(index, 1, makeBlock('divider'), fresh)
        setBlocks(next)
        setFocus({ id: fresh.id, caret: 'start' })
        return
      }
      convert(block.id, shortcut, '')
      return
    }

    updateBlock(block.id, { ...block, text: value } as Block)

    // Track the slash menu's query as the user keeps typing.
    if (slash?.id === block.id) {
      const after = value.slice(slash.at)
      if (!after.startsWith('/')) setSlash(null)
      else setSlash({ ...slash, query: after.slice(1) })
    }
  }

  const onTextKeyDown = (
    block: Block,
    event: React.KeyboardEvent,
    api: { atStart: () => boolean; atEnd: () => boolean; offset: () => number; text: () => string },
  ) => {
    // While the menu is open it owns these keys; it listens at the document
    // level and will have called preventDefault already.
    if (slash && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
      if (event.defaultPrevented) return
    }

    if (event.key === '/' && !slash) {
      setSlash({ id: block.id, at: api.offset(), query: '' })
      return
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const text = api.text()
      const at = api.offset()
      const before = text.slice(0, at)
      const after = text.slice(at)

      // A second Enter on an empty list item drops out of the list, which is
      // how every editor ends a list and how people expect to escape one.
      if (!text && (block.type === 'bullet' || block.type === 'todo')) {
        convert(block.id, { type: 'text' }, '')
        return
      }

      updateBlock(block.id, { ...block, text: before } as Block)
      // Enter continues a list; from anything else it starts a paragraph.
      const continues = block.type === 'bullet' || block.type === 'todo'
      const created = makeBlock(continues ? block.type : 'text')
      if (isTextish(created) || created.type === 'todo') created.text = after

      const index = indexOf(block.id)
      const next = [...doc.blocks]
      next[index] = { ...block, text: before } as Block
      next.splice(index + 1, 0, created)
      setBlocks(next)
      setFocus({ id: created.id, caret: 'start' })
      return
    }

    if (event.key === 'Backspace' && api.atStart()) {
      const index = indexOf(block.id)
      const text = api.text()

      // A styled empty block becomes a plain one before it disappears, so
      // Backspace undoes "make this a heading" rather than deleting a line.
      if (!text && block.type !== 'text') {
        event.preventDefault()
        convert(block.id, { type: 'text' }, '')
        return
      }
      if (index === 0) return

      const previous = doc.blocks[index - 1]
      event.preventDefault()

      if (isTextish(previous) || previous.type === 'todo') {
        // Merge into the block above, caret at the join.
        const joinAt = previous.text.length
        const merged = { ...previous, text: previous.text + text } as Block
        const next = doc.blocks.filter((b) => b.id !== block.id)
        setBlocks(next.map((b) => (b.id === previous.id ? merged : b)))
        setFocus({ id: previous.id, caret: joinAt })
      } else if (!text) {
        removeBlock(block.id)
      } else {
        // The block above is a table, code or form — stepping into it and
        // deleting it silently would be a nasty surprise.
        setFocus({ id: previous.id, caret: 'end' })
      }
      return
    }

    if (event.key === 'ArrowUp' && api.atStart()) {
      const index = indexOf(block.id)
      if (index > 0) {
        event.preventDefault()
        setFocus({ id: doc.blocks[index - 1].id, caret: 'end' })
      }
    }

    if (event.key === 'ArrowDown' && api.atEnd()) {
      const index = indexOf(block.id)
      if (index < doc.blocks.length - 1) {
        event.preventDefault()
        setFocus({ id: doc.blocks[index + 1].id, caret: 'start' })
      }
    }
  }

  return (
    <div ref={container} className="pb-40">
      <input
        value={doc.title}
        onChange={(e) => onChange({ ...doc, title: e.target.value, updatedAt: Date.now() })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault()
            if (doc.blocks[0]) setFocus({ id: doc.blocks[0].id, caret: 'start' })
          }
        }}
        placeholder="Untitled"
        aria-label="Document title"
        className="mb-2 w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-[var(--color-faint)] sm:text-4xl"
      />

      {doc.blocks.map((block) => (
        <div
          key={block.id}
          data-block-id={block.id}
          className="group/block relative -mx-2 flex items-start gap-1 rounded-md px-2"
        >
          <div className="sticky top-2 flex shrink-0 translate-y-0.5 items-center opacity-0 transition-opacity group-focus-within/block:opacity-60 group-hover/block:opacity-60">
            <button
              type="button"
              aria-label="Delete block"
              onClick={() => removeBlock(block.id)}
              className="hidden p-0.5 text-[var(--color-faint)] hover:text-[var(--color-danger)] sm:block"
            >
              <Trash2 size={13} />
            </button>
            <span className="hidden p-0.5 text-[var(--color-faint)] sm:block">
              <GripVertical size={13} />
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <BlockBody
              block={block}
              onChange={(next) => updateBlock(block.id, next)}
              onTextChange={onTextChange}
              onTextKeyDown={onTextKeyDown}
              slashOpen={slash?.id === block.id}
            />
            {slash?.id === block.id && (
              <SlashMenu
                query={slash.query}
                onPick={pickFromSlash}
                onClose={() => setSlash(null)}
              />
            )}
          </div>
        </div>
      ))}

      {/*
        A wide click target below the last block. Without it, clicking the
        empty space under a document does nothing, which reads as the page
        being finished rather than continuing.
      */}
      <button
        type="button"
        aria-label="Continue writing"
        onClick={() => {
          const last = doc.blocks[doc.blocks.length - 1]
          if (last && isTextish(last) && !last.text) {
            setFocus({ id: last.id, caret: 'end' })
            return
          }
          const fresh = makeBlock('text')
          setBlocks([...doc.blocks, fresh])
          setFocus({ id: fresh.id, caret: 'start' })
        }}
        className="mt-1 h-40 w-full cursor-text"
      />
    </div>
  )
}

function BlockBody({
  block,
  onChange,
  onTextChange,
  onTextKeyDown,
  slashOpen,
}: {
  block: Block
  onChange: (next: Block) => void
  onTextChange: (block: never, value: string) => void
  onTextKeyDown: (
    block: Block,
    event: React.KeyboardEvent,
    api: { atStart: () => boolean; atEnd: () => boolean; offset: () => number; text: () => string },
  ) => void
  slashOpen: boolean
}) {
  if (block.type === 'divider') {
    return <hr className="my-4 border-0 border-t border-[var(--color-line)]" />
  }

  if (block.type === 'table') {
    return <TableBlock block={block} onChange={onChange} />
  }

  if (block.type === 'code') {
    return <CodeBlock block={block} onChange={onChange} />
  }

  if (block.type === 'form') {
    return <FormBlock block={block} onChange={onChange} />
  }

  if (block.type === 'todo') {
    return (
      <div className="flex items-start gap-2 py-0.5">
        <input
          type="checkbox"
          checked={block.done}
          onChange={(e) => onChange({ ...block, done: e.target.checked })}
          aria-label={block.text || 'Task'}
          className="mt-[0.35rem] h-[15px] w-[15px] shrink-0 cursor-pointer accent-[var(--color-accent)]"
        />
        <Editable
          value={block.text}
          placeholder={slashOpen ? '' : 'To-do'}
          ariaLabel="Task"
          onChange={(value) => onTextChange(block as never, value)}
          onKeyDown={(event, api) => onTextKeyDown(block, event, api)}
          className={`min-w-0 flex-1 py-0.5 leading-relaxed ${
            block.done ? 'text-[var(--color-faint)] line-through' : ''
          }`}
        />
      </div>
    )
  }

  const styles: Record<string, string> = {
    text: 'py-1 leading-relaxed',
    bullet: 'py-0.5 leading-relaxed',
    quote: 'py-1 leading-relaxed italic text-[var(--color-muted)]',
  }
  const headingStyles: Record<number, string> = {
    1: 'text-2xl font-semibold tracking-tight mt-6 mb-1',
    2: 'text-xl font-semibold tracking-tight mt-5 mb-0.5',
    3: 'text-base font-semibold mt-4',
  }

  const className =
    block.type === 'heading'
      ? headingStyles[block.level ?? 1]
      : (styles[block.type] ?? styles.text)

  const placeholder = slashOpen
    ? ''
    : block.type === 'heading'
      ? 'Heading'
      : block.type === 'quote'
        ? 'Quote'
        : block.type === 'bullet'
          ? 'List item'
          : 'Type / for anything'

  const editable = (
    <Editable
      value={block.text}
      placeholder={placeholder}
      ariaLabel={block.type === 'heading' ? 'Heading' : 'Text'}
      onChange={(value) => onTextChange(block as never, value)}
      onKeyDown={(event, api) => onTextKeyDown(block, event, api)}
      className={className}
    />
  )

  if (block.type === 'bullet') {
    return (
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-[0.72rem] h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--color-muted)]"
        />
        <div className="min-w-0 flex-1">{editable}</div>
      </div>
    )
  }

  if (block.type === 'quote') {
    return (
      <div className="border-l-2 border-[var(--color-line)] pl-3">{editable}</div>
    )
  }

  return editable
}
