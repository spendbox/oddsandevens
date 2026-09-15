'use client'

import { GripVertical, Plus } from 'lucide-react'
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
  /**
   * An in-flight block drag. Pointer events rather than HTML5 drag-and-drop,
   * because dragstart never fires on a touch screen — one code path that works
   * for a mouse, a trackpad and a thumb.
   */
  const [drag, setDrag] = useState<{ id: string; overId: string | null; below: boolean } | null>(
    null,
  )
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

  /** Moves `id` to sit just before or after `targetId`. */
  const moveBlock = (id: string, targetId: string, below: boolean) => {
    if (id === targetId) return
    const moving = doc.blocks.find((b) => b.id === id)
    if (!moving) return
    const without = doc.blocks.filter((b) => b.id !== id)
    // The target index is read from the list with the dragged block already
    // removed, or dropping downward lands one place short of where it looked.
    const at = without.findIndex((b) => b.id === targetId)
    if (at === -1) return
    const next = [...without]
    next.splice(below ? at + 1 : at, 0, moving)
    setBlocks(next)
  }

  /** Moves a block one place up or down. The keyboard route to reordering. */
  const nudgeBlock = (id: string, by: -1 | 1) => {
    const index = indexOf(id)
    const target = index + by
    if (index === -1 || target < 0 || target >= doc.blocks.length) return
    const next = [...doc.blocks]
    ;[next[index], next[target]] = [next[target], next[index]]
    setBlocks(next)
    setFocus({ id, caret: 'end' })
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

  /**
   * Opens the insert menu for a block without a "/" having been typed — the
   * "+" in the gutter. It appends the slash to the block's text so that both
   * routes converge on exactly one code path for picking and cleaning up.
   */
  const openMenuFor = (id: string) => {
    const block = doc.blocks.find((b) => b.id === id)
    if (!block) return
    if (isTextish(block) || block.type === 'todo') {
      const at = block.text.length
      updateBlock(id, { ...block, text: `${block.text}/` } as Block)
      setSlash({ id, at, query: '' })
      setFocus({ id, caret: 'end' })
      return
    }
    // A table, form or code block has no text to hang the menu off, so the
    // menu belongs to a fresh block underneath it.
    const fresh = makeBlock('text')
    if (isTextish(fresh)) fresh.text = '/'
    const index = indexOf(id)
    const next = [...doc.blocks]
    next.splice(index + 1, 0, fresh)
    setBlocks(next)
    setSlash({ id: fresh.id, at: 0, query: '' })
    setFocus({ id: fresh.id, caret: 'end' })
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

  /**
   * Where a "/" was just typed, or null if this change was anything else.
   *
   * The slash menu used to open from a keydown handler testing `event.key`.
   * That works on a physical keyboard and fails on most phones: virtual
   * keyboards and IMEs report keydown as `Unidentified` with keyCode 229 and
   * only reveal the real character in the input event that follows. Detecting
   * the inserted character instead works on every keyboard, including
   * autocorrect, swipe typing, dictation and paste.
   */
  const insertedSlashAt = (before: string, after: string): number | null => {
    if (after.length !== before.length + 1) return null
    let i = 0
    while (i < before.length && before[i] === after[i]) i++
    return after[i] === '/' ? i : null
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

    if (!slash) {
      const at = insertedSlashAt(block.text, value)
      if (at !== null) setSlash({ id: block.id, at, query: '' })
      return
    }

    // Track the menu's query as the user keeps typing.
    if (slash.id === block.id) {
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

    // Alt+Arrow moves the block itself. Drag-and-drop is not reachable from a
    // keyboard, and reordering should not require a pointing device.
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && event.altKey) {
      event.preventDefault()
      nudgeBlock(block.id, event.key === 'ArrowUp' ? -1 : 1)
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
    /*
      The left inset is where the gutter controls live. They are positioned
      into it rather than laid out inline: inline, they pushed every block
      right and left the title sitting on its own, out of line with the text
      beneath it. On a phone there is no inset at all — the width matters more
      than the handles, and the floating button below covers inserting.
    */
    <div ref={container} className="relative pb-40 sm:pl-11">
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
          className={`group/block relative rounded-md ${
            drag?.id === block.id ? 'opacity-40' : ''
          }`}
        >
          {/* Where the block would land if you let go now. */}
          {drag?.overId === block.id && (
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-[var(--color-accent)] ${
                drag.below ? '-bottom-px' : '-top-px'
              }`}
            />
          )}
          {/*
            The gutter stays visible on a touch screen. It used to be
            `hidden sm:block`, which left a phone with no way to insert a block
            except typing "/" — and that did not work there either. Hover only
            fades it in on devices that have a pointer.
          */}
          <div className="absolute top-1 -left-11 hidden shrink-0 items-center opacity-0 transition-opacity group-focus-within/block:opacity-100 group-hover/block:opacity-100 sm:flex">
            <button
              type="button"
              aria-label="Insert block below"
              onClick={() => openMenuFor(block.id)}
              className="rounded p-1 text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              aria-label={`Drag to reorder, or press Alt with the arrow keys`}
              // touch-none stops the browser scrolling the page instead of
              // giving us the pointermove events a drag is made of.
              className="touch-none rounded p-1 text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
              onPointerDown={(e) => {
                e.preventDefault()
                e.currentTarget.setPointerCapture(e.pointerId)
                setDrag({ id: block.id, overId: null, below: false })
              }}
              onPointerMove={(e) => {
                if (!drag) return
                const under = document
                  .elementFromPoint(e.clientX, e.clientY)
                  ?.closest('[data-block-id]')
                const overId = under?.getAttribute('data-block-id') ?? null
                if (!overId || overId === drag.id) {
                  if (drag.overId !== null) setDrag({ ...drag, overId: null })
                  return
                }
                // Past the midpoint means below, which is what makes dropping
                // onto the lower half of a block land after it.
                const box = under!.getBoundingClientRect()
                const below = e.clientY > box.top + box.height / 2
                if (drag.overId !== overId || drag.below !== below) {
                  setDrag({ ...drag, overId, below })
                }
              }}
              onPointerUp={() => {
                if (drag?.overId) moveBlock(drag.id, drag.overId, drag.below)
                setDrag(null)
              }}
              onPointerCancel={() => setDrag(null)}
            >
              <GripVertical size={14} />
            </button>
          </div>

          <div className="relative min-w-0">
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
      {/*
        The phone's way in. Typing "/" works again now, but a visible button is
        discoverable in a way an invisible keystroke is not, and on a touch
        screen there is no gutter to hover.
      */}
      <button
        type="button"
        aria-label="Insert block"
        onClick={() => {
          const last = doc.blocks[doc.blocks.length - 1]
          if (last && (isTextish(last) || last.type === 'todo') && !last.text) {
            openMenuFor(last.id)
            return
          }
          const fresh = makeBlock('text')
          if (isTextish(fresh)) fresh.text = '/'
          setBlocks([...doc.blocks, fresh])
          setSlash({ id: fresh.id, at: 0, query: '' })
          setFocus({ id: fresh.id, caret: 'end' })
        }}
        className="fixed right-4 bottom-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-lg active:scale-95 sm:hidden"
      >
        <Plus size={22} />
      </button>

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
