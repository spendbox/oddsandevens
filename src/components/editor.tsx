'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { blocksFromPasted, makeBlock, shortcutFor } from '@/lib/blocks'
import { blocksToText } from '@/lib/export'
import type { PastedBlock } from '@/lib/paste'
import { blockHtml, hasFormatting, sanitizeInline } from '@/lib/rich-text'
import {
  bulletFor,
  colonStartsList,
  looksLikeTitle,
  nextIndent,
  orderedNumber,
} from '@/lib/smart-typing'
import type { Align, Block, BlockType, Doc, TextishBlock } from '@/lib/types'
import { isTextish } from '@/lib/types'
import { MODE, TEXT, usePref } from '@/lib/ui-prefs'
import ActionPlan from './action-plan'
import CodeBlock from './code-block'
import DictationButton from './dictation-button'
import PlainEditor from './plain-editor'
import Editable, { placeCaret } from './editable'
import FormatToolbar from './format-toolbar'
import FileBlock from './file-block'
import FormBlock from './form-block'
import Ribbon, { type RibbonTarget } from './ribbon'
import TableBlock from './table-block'

/**
 * The document editor.
 *
 * It owns block structure — creating, splitting, merging, deleting and
 * focusing — and hands the inside of each block to a component that knows
 * that block type. Keeping structure in one place is what lets Enter,
 * Backspace and the toolbar behave identically no matter which kind of block
 * the caret happens to be in.
 *
 * ## Why this looks like a word processor and not a block editor
 *
 * A document is still a list of blocks — that rule has not moved, and it is
 * what lets a spreadsheet sit inside a meeting note. What has gone is the
 * *chrome* that announced it: the grip and the plus sign that appeared in the
 * margin of every paragraph as the pointer went past. Those tell you that you
 * are assembling a page out of components. Nobody writing a letter wants to be
 * told that, and the handles moved the controls to wherever the pointer
 * happened to be, which is the opposite of somewhere you can learn.
 *
 * So the controls live in one fixed toolbar above the page (ribbon.tsx), the
 * paragraphs sit on a sheet of paper, and the keyboard does what it does in
 * Word: Enter makes a paragraph, Tab indents, Alt+Shift+Up moves a paragraph,
 * Ctrl+A selects everything. The block model is underneath, where it belongs,
 * rather than on the surface where it is somebody else's problem.
 */
export default function Editor({
  doc,
  onChange,
  onExtractPdf,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  externalRevision = 0,
  aiReady,
  command = null,
  onPlanDone,
}: {
  doc: Doc
  onChange: (next: Doc) => void
  /** Offered on an attached PDF: pull its text into editable blocks. */
  onExtractPdf?: (file: Blob, name: string) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  /**
   * Bumped by whatever owns the history when it puts an older document back.
   *
   * It is added to this editor's own revision before being handed to each
   * block, because an undo rewrites text the caret may be sitting in — and
   * Editable deliberately refuses to repaint a focused element unless the
   * revision says the change was structural. Without this, undoing while the
   * caret is in the paragraph being undone leaves the old text on screen.
   */
  externalRevision?: number
  /**
   * Whether writing help is configured. Asked once by the workspace and handed
   * down, rather than by every panel that wants to know: three components
   * asking the same question on mount is three requests for one answer that
   * cannot change while the tab is open.
   */
  aiReady: boolean
  /**
   * A press in the side menu that has to land in here.
   *
   * The action button is offered beside the document's other settings as well
   * as on the toolbar, but the plan is painted over the editing surface. A
   * counter rather than a flag, so pressing it twice opens it twice and there
   * is nothing for the sender to clear afterwards.
   */
  command?: { kind: 'plan'; n: number } | null
  /** Told when a plan has been read, so anything outside can react. */
  onPlanDone?: () => void
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
  /**
   * Incremented whenever the editor rewrites a block's content itself rather
   * than the user typing it — a split, a merge, a conversion. Editable watches
   * it to know when a repaint must override its "never repaint while focused"
   * rule. See the note on Editable's `revision` prop.
   */
  const [revision, setRevision] = useState(0)
  const bumpRevision = () => setRevision((r) => r + 1)
  /** What the blocks are actually painted against. See `externalRevision`. */
  const paintRevision = revision + externalRevision
  /**
   * A selection that spans whole blocks.
   *
   * Each block is its own contenteditable, and a browser will not extend a
   * native selection from one into another — which is why dragging past the
   * end of a line appeared to do nothing at all. Once a drag leaves the block
   * it started in, the native selection is dropped and this takes over:
   * whole blocks highlight, and copy, cut, delete and typing act on the run.
   */
  const [blockSel, setBlockSel] = useState<{ anchor: string; focus: string } | null>(null)
  const dragAnchor = useRef<string | null>(null)
  /**
   * The block the caret is in.
   *
   * The toolbar needs it to show which style and alignment are in force, and
   * every toolbar command needs it to know what to act on. It is not cleared
   * on blur: pressing a button in the toolbar moves focus out of the block for
   * an instant, and forgetting where the caret was at that exact moment would
   * make every button a no-op.
   */
  const [currentId, setCurrentId] = useState<string | null>(null)
  /** Whether the plan is on screen. Never opened by anything but a press. */
  const [planning, setPlanning] = useState(false)
  /*
    A press in the side menu, acted on as it arrives.

    Adjusted during render rather than in an effect — the pattern this codebase
    uses for "a prop changed, so this state is stale" — because in an effect
    the drawer has already closed and the page has painted once without the
    panel, which reads as the press having done nothing.
  */
  const [seenCommand, setSeenCommand] = useState(command?.n ?? 0)
  if (command && command.n !== seenCommand) {
    setSeenCommand(command.n)
    setPlanning(true)
  }

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

  /** The inclusive index range a block selection covers, in document order. */
  const selectedRange = (): [number, number] | null => {
    if (!blockSel) return null
    const a = indexOf(blockSel.anchor)
    const b = indexOf(blockSel.focus)
    if (a === -1 || b === -1) return null
    return a <= b ? [a, b] : [b, a]
  }

  const selectedBlocks = (): Block[] => {
    const range = selectedRange()
    return range ? doc.blocks.slice(range[0], range[1] + 1) : []
  }

  /** Removes the selected run and leaves the caret where it was. */
  const deleteSelection = (): boolean => {
    const range = selectedRange()
    if (!range) return false
    const next = doc.blocks.filter((_, i) => i < range[0] || i > range[1])
    const fresh = next.length ? next : [makeBlock('text')]
    setBlocks(fresh)
    setBlockSel(null)
    bumpRevision()
    const landing = fresh[Math.max(0, range[0] - 1)] ?? fresh[0]
    if (landing) setFocus({ id: landing.id, caret: 'end' })
    return true
  }

  /**
   * Keyboard and clipboard while whole blocks are selected.
   *
   * Bound to the document because the selection is not inside any one block,
   * so there is no element holding focus to hang these off.
   */
  useEffect(() => {
    if (!blockSel) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBlockSel(null)
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        deleteSelection()
        return
      }
      // A printable character replaces the selection, the way it would in any
      // other editor. Modifier combinations are left to the browser.
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault()
        const range = selectedRange()
        if (!range) return
        const replacement = makeBlock('text')
        if (isTextish(replacement)) replacement.text = event.key
        const next = [
          ...doc.blocks.slice(0, range[0]),
          replacement,
          ...doc.blocks.slice(range[1] + 1),
        ]
        setBlocks(next)
        setBlockSel(null)
        bumpRevision()
        setFocus({ id: replacement.id, caret: 'end' })
      }
    }

    const onCopy = (event: ClipboardEvent) => {
      const blocks = selectedBlocks()
      if (!blocks.length) return
      event.preventDefault()
      // Markdown on the HTML flavour too: it is what survives being pasted
      // into a plain-text field, and Pad's own paste parser reads it back.
      event.clipboardData?.setData('text/plain', blocksToText(blocks))
      event.clipboardData?.setData(
        'text/html',
        blocks
          .map((b) => `<p>${blockHtml(b as { text: string; html?: string })}</p>`)
          .join(''),
      )
    }

    const onCut = (event: ClipboardEvent) => {
      onCopy(event)
      deleteSelection()
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
    }
    // Re-bound whenever the selection or the blocks change, so the handlers
    // always act on what is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockSel, doc.blocks])

  /**
   * Moves a block one place up or down.
   *
   * The only way to reorder a paragraph now that the drag handles have gone,
   * and the same keystroke a word processor has used for it for thirty years —
   * which is rather the point of removing the handles.
   */
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
  const convert = (
    id: string,
    choice: { type: BlockType; level?: 1 | 2 | 3; ordered?: boolean },
    keepText: string,
    keepHtml?: string,
  ) => {
    const source = doc.blocks.find((b) => b.id === id)
    const created = makeBlock(choice.type, choice.level)
    if (created.type === 'bullet' && choice.ordered) created.ordered = true
    if (isTextish(created) || created.type === 'todo') {
      if (keepText) {
        created.text = keepText
        created.html = keepHtml
      }
      // Indentation and alignment belong to the paragraph, not to the kind of
      // paragraph it is, so turning a line into a list item must not silently
      // pull it back to the left margin.
      const before = source as TextishBlock | undefined
      if (before?.indent) created.indent = before.indent
      if (before?.align) created.align = before.align
    }
    setBlocks(doc.blocks.map((b) => (b.id === id ? created : b)))
    bumpRevision()
    setFocus({ id: created.id, caret: 'end' })
  }

  /* ------------------------------------------------------------- the toolbar */

  /** The block the toolbar is describing, or the last one the caret was in. */
  const currentBlock = currentId ? (doc.blocks.find((b) => b.id === currentId) ?? null) : null

  const ribbonTarget: RibbonTarget | null = currentBlock
    ? {
        type: currentBlock.type,
        level: (currentBlock as TextishBlock).level,
        align: (currentBlock as TextishBlock).align,
        ordered: (currentBlock as TextishBlock).ordered,
        indent: (currentBlock as TextishBlock).indent,
      }
    : null

  /** Which block a toolbar command acts on: the caret's, or failing that the last. */
  const actOn = (): Block | null =>
    currentBlock ?? doc.blocks[doc.blocks.length - 1] ?? null

  const styleCurrent = (choice: { type: Block['type']; level?: 1 | 2 | 3; ordered?: boolean }) => {
    const block = actOn()
    if (!block) return
    const text = isTextish(block) || block.type === 'todo' ? block.text : ''
    const html = isTextish(block) || block.type === 'todo' ? block.html : undefined
    // Pressing "bulleted list" while already in one turns it back into a
    // paragraph, which is what the same button does in every word processor.
    const already =
      block.type === choice.type &&
      (choice.type !== 'heading' || (block as TextishBlock).level === choice.level) &&
      (choice.type !== 'bullet' || !!(block as TextishBlock).ordered === !!choice.ordered)
    convert(block.id, already ? { type: 'text' } : choice, text, html)
  }

  const alignCurrent = (align: Align) => {
    const block = actOn()
    if (!block || !(isTextish(block) || block.type === 'todo')) return
    // Left is the absence of alignment rather than a value, so a left-aligned
    // paragraph is stored exactly as every paragraph written before alignment
    // existed. See `align` in lib/types.ts.
    const next = { ...block } as TextishBlock
    if (align === 'left') delete next.align
    else next.align = align
    updateBlock(block.id, next as Block)
    setFocus({ id: block.id, caret: 'end' })
  }

  const indentCurrent = (by: -1 | 1) => {
    const block = actOn()
    if (!block || !(isTextish(block) || block.type === 'todo')) return
    const current = (block as TextishBlock).indent
    const to = nextIndent(current, by)
    if (to === (current ?? 0)) return
    updateBlock(block.id, { ...block, indent: to || undefined } as Block)
    setFocus({ id: block.id, caret: 'end' })
  }

  /** Insert from the toolbar: a table, some code, a form, a line. */
  const insertFromToolbar = (type: Block['type']) => {
    const block = actOn()
    const created = makeBlock(type)
    if (!block) {
      setBlocks([...doc.blocks, created])
      return
    }
    const host = isTextish(block) || block.type === 'todo' ? block : null
    // An empty paragraph becomes the new block rather than sitting above it as
    // a blank line, which is what somebody means by "insert here".
    if (host && !host.text.trim()) {
      setBlocks(doc.blocks.map((b) => (b.id === block.id ? created : b)))
      bumpRevision()
      if (type === 'divider') {
        const after = makeBlock('text')
        setBlocks([
          ...doc.blocks.slice(0, indexOf(block.id)),
          created,
          after,
          ...doc.blocks.slice(indexOf(block.id) + 1),
        ])
        setFocus({ id: after.id, caret: 'start' })
      }
      return
    }
    const index = indexOf(block.id)
    const next = [...doc.blocks]
    next.splice(index + 1, 0, created)
    // A divider has nothing to type into, so it always leaves a line after it.
    if (type === 'divider') {
      const after = makeBlock('text')
      next.splice(index + 2, 0, after)
      setBlocks(next)
      setFocus({ id: after.id, caret: 'start' })
      return
    }
    setBlocks(next)
    setFocus({ id: created.id, caret: 'start' })
  }

  /*
    Undo and redo, taken over from the browser.

    The browser's own Ctrl+Z works inside one contenteditable, which here is
    one paragraph — so it took back a few characters and knew nothing about the
    split, the delete or the whole-page rewrite somebody actually wanted back.
    Two undo systems that disagree is worse than one that is slightly coarser,
    so this one wins and the native one is prevented.
  */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) onRedo()
        else onUndo()
        return
      }
      // Ctrl+Y is redo on Windows, and costs one line to honour.
      if (key === 'y') {
        event.preventDefault()
        onRedo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onUndo, onRedo])

  /* ---------------------------------------------------------------- typing */

  /**
   * Turns a multi-block paste into blocks after the current one.
   *
   * The first pasted paragraph is merged into the block the caret is in when
   * that block is empty, so pasting into a fresh line does not leave a blank
   * one above the content.
   */
  const insertPasted = (id: string, pasted: PastedBlock[]): boolean => {
    const at = indexOf(id)
    if (at === -1) return false
    const host = doc.blocks[at]
    const hostEmpty =
      (isTextish(host) || host.type === 'todo') && !host.text.trim()

    const created = blocksFromPasted(pasted)

    const next = [...doc.blocks]
    next.splice(hostEmpty ? at : at + 1, hostEmpty ? 1 : 0, ...created)
    setBlocks(next)
    bumpRevision()
    const last = created[created.length - 1]
    if (last) setFocus({ id: last.id, caret: 'end' })
    return true
  }

  /** Text typed into a text-ish or todo block. Handles markdown shortcuts. */
  const onTextChange = (
    block: TextishBlock | Extract<Block, { type: 'todo' }>,
    value: string,
    html?: string,
  ) => {
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

    updateBlock(block.id, { ...block, text: value, html } as Block)
  }

  const onTextKeyDown = (
    block: Block,
    event: React.KeyboardEvent,
    api: {
      atStart: () => boolean
      atEnd: () => boolean
      offset: () => number
      text: () => string
      split: () => {
        before: { text: string; html?: string }
        after: { text: string; html?: string }
      }
    },
  ) => {
    /*
      Ctrl+A selects the paragraph, then the document.

      The browser's own Ctrl+A stops at the edge of the contenteditable, which
      in this editor is one paragraph — so in a five-page document it selected
      a line and appeared broken. Pressing it again, once the paragraph is
      already fully selected, takes the whole document, which is what a second
      press does in every application that has two levels of "all".
    */
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
      const selection = window.getSelection()
      const whole = api.text()
      if (whole && selection && !selection.isCollapsed && selection.toString() === whole) {
        event.preventDefault()
        selection.removeAllRanges()
        const first = doc.blocks[0]
        const last = doc.blocks[doc.blocks.length - 1]
        if (first && last) setBlockSel({ anchor: first.id, focus: last.id })
      }
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

      // Split through the DOM, not the plain string: pressing Enter inside a
      // bold phrase has to leave both halves bold.
      const parts = api.split()
      const head = parts.before.text === before ? parts.before : { text: before, html: undefined }
      const tail = parts.after.text === after ? parts.after : { text: after, html: undefined }

      // A line that ends in a colon is announcing a list almost every time
      // it is written, so Enter starts one.
      const announcesList = !after && colonStartsList(before)

      // The opening line of a document, left unpunctuated, is its title.
      // Applied once — only while the document has neither a title nor a
      // heading — so it cannot keep surprising someone further down the page,
      // and never contradicts a title the writer has already given.
      const isFirst = indexOf(block.id) === 0
      const hasHeading = doc.blocks.some((b) => b.type === 'heading')
      const titled = doc.title.trim() !== ''
      if (
        isFirst &&
        !hasHeading &&
        !titled &&
        !after &&
        block.type === 'text' &&
        looksLikeTitle(before) &&
        !announcesList
      ) {
        const heading = makeBlock('heading', 1)
        if (heading.type === 'heading') {
          heading.text = head.text
          heading.html = head.html
        }
        const fresh = makeBlock('text')
        const index = indexOf(block.id)
        const next = [...doc.blocks]
        next.splice(index, 1, heading, fresh)
        setBlocks(next)
        bumpRevision()
        setFocus({ id: fresh.id, caret: 'start' })
        return
      }

      // Enter continues a list; from anything else it starts a paragraph.
      const continues = block.type === 'bullet' || block.type === 'todo'
      const created = makeBlock(announcesList ? 'bullet' : continues ? block.type : 'text')
      if (isTextish(created) || created.type === 'todo') {
        created.text = tail.text
        created.html = tail.html
        // A new line in a list stays at the depth of the one above it.
        if (continues || announcesList) created.indent = (block as TextishBlock).indent
        // And keeps the alignment, which is a property of the page rather than
        // of the paragraph that happened to be above it.
        if ((block as TextishBlock).align) created.align = (block as TextishBlock).align
        // And keeps its numbering, which then counts itself.
        if (created.type === 'bullet' && block.type === 'bullet' && block.ordered) {
          created.ordered = true
        }
      }

      const index = indexOf(block.id)
      const next = [...doc.blocks]
      next[index] = { ...block, text: head.text, html: head.html } as Block
      next.splice(index + 1, 0, created)
      setBlocks(next)
      bumpRevision()
      setFocus({ id: created.id, caret: 'start' })
      return
    }

    if (event.key === 'Backspace' && api.atStart()) {
      const index = indexOf(block.id)
      const text = api.text()

      // Backspace unwinds the indentation before it touches the block, so
      // getting out of a sub-list never costs you the line you are on.
      const indented = (block as TextishBlock).indent ?? 0
      if (indented > 0) {
        event.preventDefault()
        updateBlock(block.id, { ...block, indent: indented - 1 || undefined } as Block)
        setFocus({ id: block.id, caret: 'start' })
        return
      }

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
        // Merge into the block above, caret at the join. If either side is
        // formatted, both are painted as HTML so neither loses its marks.
        const joinAt = previous.text.length
        const mergedText = previous.text + text
        const mergedHtml =
          previous.html || (isTextish(block) || block.type === 'todo' ? block.html : undefined)
            ? sanitizeInline(
                blockHtml(previous) + blockHtml({ text, html: (block as TextishBlock).html }),
              )
            : undefined
        const merged = {
          ...previous,
          text: mergedText,
          html: mergedHtml && hasFormatting(mergedHtml, mergedText) ? mergedHtml : undefined,
        } as Block
        const next = doc.blocks.filter((b) => b.id !== block.id)
        setBlocks(next.map((b) => (b.id === previous.id ? merged : b)))
        bumpRevision()
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

    // Tab indents rather than moving focus, which is what makes sub-lists
    // possible and what every word processor does inside a list. Escape blurs
    // the block first, so Tab can still leave the editor — without that this
    // would be a keyboard trap.
    if (event.key === 'Tab') {
      event.preventDefault()
      const current = (block as TextishBlock).indent
      const to = nextIndent(current, event.shiftKey ? -1 : 1)
      if (to !== (current ?? 0)) {
        updateBlock(block.id, { ...block, indent: to || undefined } as Block)
        setFocus({ id: block.id, caret: api.offset() })
      }
      return
    }

    if (event.key === 'Escape') {
      ;(event.target as HTMLElement).blur()
      return
    }

    // Alt+Arrow moves the paragraph itself, and so does Alt+Shift+Arrow, which
    // is the binding Word has used for it since before most of this app's
    // users were typing. There is no drag handle any more; this is the way.
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && event.altKey) {
      event.preventDefault()
      nudgeBlock(block.id, event.key === 'ArrowUp' ? -1 : 1)
      return
    }

    /*
      Shift with the arrows, at the top or bottom of a paragraph, extends the
      selection into the paragraph above or below.

      Without this, holding Shift and pressing Down stopped dead at the end of
      the line — each block being its own contenteditable, there is nowhere for
      a native selection to go. Selecting three paragraphs with the keyboard is
      not an advanced gesture; it is how people delete a section.
    */
    if (event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const index = indexOf(block.id)
      const up = event.key === 'ArrowUp'
      const edge = up ? api.atStart() : api.atEnd()
      const target = index + (up ? -1 : 1)
      if (edge && target >= 0 && target < doc.blocks.length) {
        event.preventDefault()
        window.getSelection()?.removeAllRanges()
        setBlockSel({ anchor: block.id, focus: doc.blocks[target].id })
        return
      }
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

  /* ------------------------------------------------------------------ render */

  /*
    The text size lives on <html> and in localStorage rather than in React
    state, so it is applied before the first paint and does not flash. Read
    here through the same hook the rest of the interface uses; unset means
    medium, which is already the larger default. See lib/ui-prefs.ts.
  */
  const { value: textPref, set: setTextPref } = usePref(TEXT)
  const textSize = textPref ?? 'medium'
  /*
    Which writing surface. `blocks` is the default and is this app's own shape;
    `plain` is one editable element for the whole page, where the browser does
    the selecting and the line breaking. See lib/plain-doc.ts.
  */
  const { value: modePref } = usePref(MODE)
  const plain = modePref === 'plain'
  return (
    <div ref={container} className="relative">
      <Ribbon
        target={ribbonTarget}
        onStyle={styleCurrent}
        onAlign={alignCurrent}
        onIndent={indentCurrent}
        onInsert={insertFromToolbar}
        onPlan={() => setPlanning(true)}
        textSize={textSize}
        onTextSize={setTextPref}
        onUndo={onUndo}
        onRedo={onRedo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <div
        className="px-4 pt-5 pb-32 sm:px-12 sm:pt-8"
        onPointerDown={(event) => {
          const target = event.target as Element | null
          const host = target?.closest<HTMLElement>('[data-block-id]')
          dragAnchor.current = host?.dataset.blockId ?? null
          if (blockSel) setBlockSel(null)
        }}
        onPointerMove={(event) => {
          const anchor = dragAnchor.current
          // buttons === 0 means nothing is held down, so this is just a hover.
          if (!anchor || event.buttons === 0) return
          const over = document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest<HTMLElement>('[data-block-id]')
          const id = over?.dataset.blockId
          if (!id || id === anchor) return
          // The drag has left the block it started in. The browser cannot
          // carry a text selection across the boundary, so drop it and select
          // whole blocks instead.
          window.getSelection()?.removeAllRanges()
          setBlockSel((current) =>
            current?.anchor === anchor && current.focus === id ? current : { anchor, focus: id },
          )
        }}
        onPointerUp={() => {
          dragAnchor.current = null
        }}
      >
        <FormatToolbar scope={container} />

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
          className="pad-doc-title mb-3 w-full bg-transparent font-semibold tracking-tight outline-none placeholder:text-[var(--color-faint)]"
        />

        {plain ? (
          /*
            One editable element for the whole page. Everything the block
            surface reimplements — Ctrl+A across the document, a selection that
            runs past the end of a paragraph, Enter making a line — is the
            browser's own behaviour in here. See plain-editor.tsx.
          */
          <PlainEditor doc={doc} onChange={onChange} revision={paintRevision} />
        ) : (
        <div className="pad-doc">
          {doc.blocks.map((block, blockIndex) => (
            <div
              key={block.id}
              data-block-id={block.id}
              /*
                A heading stays put while its section is on screen.

                The sticky is on this wrapper rather than on the heading's own
                text, because a sticky element sticks within its containing
                block — and a heading's own box is exactly one heading tall, so
                it stuck to nothing at all. The wrapper's containing block is
                the whole run of blocks, which is the length of the document.
              */
              className={`relative rounded-sm ${
                block.type === 'heading' ? 'pad-sticky-heading' : ''
              } ${
                (() => {
                  const range = selectedRange()
                  return range && blockIndex >= range[0] && blockIndex <= range[1]
                    ? 'bg-[var(--color-accent-soft)]'
                    : ''
                })()
              }`}
              // Indentation as padding rather than nested markup: a list is
              // still a flat run of blocks, so moving one out of a sub-list is
              // the same operation as any other move.
              style={{ paddingLeft: ((block as TextishBlock).indent ?? 0) * 1.75 + 'rem' }}
            >
              <div className="relative min-w-0">
                <BlockBody
                  block={block}
                  onChange={(next) => updateBlock(block.id, next)}
                  onTextChange={onTextChange}
                  onTextKeyDown={onTextKeyDown}
                  onTextFocus={() => setCurrentId(block.id)}
                  revision={paintRevision}
                  onRemove={() => removeBlock(block.id)}
                  number={orderedNumber(doc.blocks, blockIndex)}
                  onPasteBlocks={insertPasted}
                  onExtractPdf={onExtractPdf}
                />
              </div>
            </div>
          ))}
        </div>
        )}

        {/*
          A wide click target below the last block. Without it, clicking the
          empty space under a document does nothing, which reads as the page
          being finished rather than continuing.
        */}
        {!plain && (
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
          className="mt-2 h-48 w-full cursor-text"
        />
        )}
      </div>

      {/*
        Speech into the document. It writes where the caret is, or at the end
        when there is no caret — which is where somebody who has just pressed
        record and talked for ten minutes expects their meeting to appear.
      */}
      <DictationButton
        title={doc.title}
        aiReady={aiReady}
        onWrite={(pasted) => {
          if (!pasted.length) return
          const at = currentId ?? doc.blocks[doc.blocks.length - 1]?.id
          if (at && insertPasted(at, pasted)) return
          const created = blocksFromPasted(pasted)
          setBlocks([...doc.blocks, ...created])
          bumpRevision()
          const last = created[created.length - 1]
          if (last) setFocus({ id: last.id, caret: 'end' })
        }}
      />

      <ActionPlan
        open={planning}
        onClose={() => {
          setPlanning(false)
          onPlanDone?.()
        }}
        doc={doc}
        aiReady={aiReady}
      />
    </div>
  )
}

function BlockBody({
  block,
  onChange,
  onTextChange,
  onTextKeyDown,
  onTextFocus,
  revision,
  onRemove,
  onPasteBlocks,
  onExtractPdf,
  number,
}: {
  block: Block
  onChange: (next: Block) => void
  onTextChange: (block: never, value: string, html?: string) => void
  onTextKeyDown: (
    block: Block,
    event: React.KeyboardEvent,
    api: {
      atStart: () => boolean
      atEnd: () => boolean
      offset: () => number
      text: () => string
      split: () => {
        before: { text: string; html?: string }
        after: { text: string; html?: string }
      }
    },
  ) => void
  onTextFocus: () => void
  revision: number
  onRemove: () => void
  onPasteBlocks: (id: string, blocks: PastedBlock[]) => boolean
  onExtractPdf?: (file: Blob, name: string) => void
  /** The printed position of an ordered list item. */
  number: number
}) {
  if (block.type === 'divider') {
    return <hr className="my-6 border-0 border-t border-[var(--color-line)]" />
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

  if (block.type === 'file') {
    return (
      <FileBlock
        block={block}
        onChange={onChange}
        onRemove={onRemove}
        onExtractPdf={onExtractPdf}
      />
    )
  }

  /** Alignment is a class on the paragraph. See `Align` in lib/types.ts. */
  const aligned =
    block.align === 'center'
      ? ' pad-align-center'
      : block.align === 'right'
        ? ' pad-align-right'
        : block.align === 'justify'
          ? ' pad-align-justify'
          : ''

  if (block.type === 'todo') {
    return (
      <div className="flex items-start gap-2.5 py-0.5">
        <input
          type="checkbox"
          checked={block.done}
          onChange={(e) => onChange({ ...block, done: e.target.checked })}
          aria-label={block.text || 'Task'}
          className="mt-[0.5em] h-[15px] w-[15px] shrink-0 cursor-pointer accent-[var(--color-accent)]"
        />
        <Editable
          value={block.text}
          html={block.html}
          revision={revision}
          onPasteBlocks={(blocks) => onPasteBlocks(block.id, blocks)}
          placeholder="To-do"
          ariaLabel="Task"
          onChange={(value, html) => onTextChange(block as never, value, html)}
          onKeyDown={(event, api) => onTextKeyDown(block, event, api)}
          onFocus={onTextFocus}
          className={`min-w-0 flex-1 py-0.5${aligned} ${
            block.done ? 'text-[var(--color-faint)] line-through' : ''
          }`}
        />
      </div>
    )
  }

  /*
    Every size here is a multiple of --doc-text rather than a fixed Tailwind
    step, so the size control in the toolbar moves the whole typographic scale
    together. See globals.css.
  */
  const styles: Record<string, string> = {
    text: 'py-1',
    bullet: 'py-0.5',
    quote: 'py-1 italic text-[var(--color-muted)]',
  }
  const headingStyles: Record<number, string> = {
    1: 'pad-h1 font-semibold tracking-tight mt-8 mb-1',
    2: 'pad-h2 font-semibold tracking-tight mt-6 mb-0.5',
    3: 'pad-h3 font-semibold mt-5',
  }

  const className =
    (block.type === 'heading'
      ? headingStyles[block.level ?? 1]
      : (styles[block.type] ?? styles.text)) + aligned

  const placeholder =
    block.type === 'heading'
      ? 'Heading'
      : block.type === 'quote'
        ? 'Quote'
        : block.type === 'bullet'
          ? 'List item'
          : // No shortcut is promised here: a hint that is wrong on half the
            // devices is worse than no hint at all.
            'Write something'

  const editable = (
    <Editable
      value={block.text}
      html={block.html}
      revision={revision}
      onPasteBlocks={(blocks) => onPasteBlocks(block.id, blocks)}
      placeholder={placeholder}
      ariaLabel={block.type === 'heading' ? 'Heading' : 'Text'}
      onChange={(value, html) => onTextChange(block as never, value, html)}
      onKeyDown={(event, api) => onTextKeyDown(block, event, api)}
      onFocus={onTextFocus}
      className={className}
    />
  )

  if (block.type === 'bullet') {
    // A numbered item prints its position, counted from the run above rather
    // than stored — so Enter continues the sequence and deleting an item
    // renumbers the rest, with nothing to keep in step.
    if (block.ordered) {
      return (
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden
            className="min-w-[1.6em] shrink-0 py-0.5 text-right text-[var(--color-muted)] tabular-nums"
          >
            {number}.
          </span>
          <div className="min-w-0 flex-1">{editable}</div>
        </div>
      )
    }
    // Solid, hollow, square — the cycle every word processor uses, so depth is
    // readable without counting the indentation.
    const glyph = bulletFor(block.indent)
    return (
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={`mt-[0.75em] h-[5px] w-[5px] shrink-0 ${
            glyph === 'square' ? '' : 'rounded-full'
          } ${
            glyph === 'circle'
              ? 'border border-[var(--color-muted)]'
              : 'bg-[var(--color-muted)]'
          }`}
        />
        <div className="min-w-0 flex-1">{editable}</div>
      </div>
    )
  }

  if (block.type === 'quote') {
    return <div className="border-l-2 border-[var(--color-line)] pl-4">{editable}</div>
  }

  return editable
}
