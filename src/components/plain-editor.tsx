'use client'

import { useEffect, useRef } from 'react'
import { shortcutFor } from '@/lib/blocks'
import { parseClipboard } from '@/lib/paste'
import { blocksFromPasted } from '@/lib/blocks'
import { editableInPlain, reconcile, type Line } from '@/lib/plain-doc'
import { blockHtml, sanitizeInline } from '@/lib/rich-text'
import { blockText, isTextish, type Block, type Doc, type TextishBlock } from '@/lib/types'

/**
 * The plain writing surface: one editable region for the whole document.
 *
 * ## What this is for
 *
 * The block surface is one `contenteditable` per paragraph, which is what lets
 * a spreadsheet sit between two sentences. It also means the browser's
 * selection stops at the end of a paragraph, so Ctrl+A takes a line, dragging
 * past the end of one paragraph selects nothing, and both had to be
 * reimplemented by hand — a two-press Ctrl+A that escalates, and a
 * whole-block selection that takes over once a drag leaves its paragraph.
 * They work, and they are not what a word processor does.
 *
 * Here there is one editable element and the browser does all of it. Enter
 * makes a line because Enter makes a line. Ctrl+A takes the document. A
 * selection runs from the first word to the last and copies as one piece.
 * Nothing is reimplemented, which is the entire argument for this mode: not
 * fewer features, but the browser doing what it already knows how to do.
 *
 * ## What is not here
 *
 * No block handles, no reordering, no per-paragraph chrome, no menu bound to a
 * character. The toolbar still sets the paragraph style and the marks, because
 * that is what a toolbar is for in every word processor there has ever been.
 *
 * ## How it stays a list of blocks underneath
 *
 * Because everything that reads a document — search, export, the plan, sync,
 * the shared copy — is written against blocks, and none of that changes for a
 * writing surface. So this paints blocks out as lines and reads lines back
 * through `reconcile` in lib/plain-doc.ts, which is where the rules live and
 * where they are tested. Switching modes is a repaint, never a conversion:
 * the document on disk is the same document either way.
 *
 * ## The rule that makes contenteditable behave
 *
 * React must not own the text while somebody is typing. A keystroke that goes
 * to state and comes back as a re-render rebuilds the text nodes and throws
 * the caret to the start — the classic bug where typing runs backwards. So
 * this is uncontrolled: it paints on mount, and afterwards only when the
 * document changed somewhere else and this element does not have focus. The
 * same rule, and the same reason, as `Editable`.
 */
export interface PlainEditorProps {
  doc: Doc
  onChange: (next: Doc) => void
  /**
   * Bumped when something outside rewrites the document — an undo, an import,
   * a dictation. It is what overrides "never repaint while focused", which is
   * otherwise exactly what would leave the undone text on screen.
   */
  revision: number
}

/** Paints one block as a line of the surface. */
function lineHtml(block: Block): string {
  if (!editableInPlain(block)) return ''
  return blockHtml({ text: blockText(block), html: (block as TextishBlock).html })
}

/** The class a block's line wears, so the type still reads as itself. */
function lineClass(block: Block): string {
  const align =
    (block as TextishBlock).align === 'center'
      ? ' pad-align-center'
      : (block as TextishBlock).align === 'right'
        ? ' pad-align-right'
        : (block as TextishBlock).align === 'justify'
          ? ' pad-align-justify'
          : ''
  if (block.type === 'heading') {
    const level = (block as TextishBlock).level ?? 1
    const styles: Record<number, string> = {
      1: 'pad-h1 font-semibold tracking-tight mt-8 mb-1',
      2: 'pad-h2 font-semibold tracking-tight mt-6 mb-0.5',
      3: 'pad-h3 font-semibold mt-5',
    }
    return styles[level] + align
  }
  if (block.type === 'quote') {
    return 'py-1 italic text-[var(--color-muted)] border-l-2 border-[var(--color-line)] pl-3' + align
  }
  if (block.type === 'bullet') return 'py-0.5 list-disc ml-5' + align
  if (block.type === 'todo') return 'py-0.5' + align
  return 'py-1' + align
}

export default function PlainEditor({ doc, onChange, revision }: PlainEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  /** What was last painted, so an unchanged document is not repainted. */
  const painted = useRef('')
  /** Where to put the caret after a repaint this component asked for. */
  const caretTo = useRef<{ id: string; offset: number } | null>(null)

  const paint = () => {
    const el = host.current
    if (!el) return
    const html = doc.blocks
      .map((block) => {
        const id = escapeAttr(block.id)
        if (!editableInPlain(block)) {
          /*
            Not text, so it is painted and not typed into. `contenteditable
            ="false"` is what lets a selection run straight over it — the
            browser treats it as one object, so Ctrl+A still takes the whole
            document and a copy still carries it.
          */
          return (
            `<div data-block-id="${id}" data-plain-locked="true" contenteditable="false" ` +
            `class="my-3 rounded-md border border-dashed border-[var(--color-line)] px-3 py-2 ` +
            `text-[13px] text-[var(--color-faint)] select-none">` +
            `${escapeText(describe(block))}</div>`
          )
        }
        const body = lineHtml(block) || '<br>'
        const marker = block.type === 'todo' ? '<span contenteditable="false" class="select-none text-[var(--color-faint)]">☐ </span>' : ''
        return `<div data-block-id="${id}" class="${escapeAttr(lineClass(block))}">${marker}${body}</div>`
      })
      .join('')
    el.innerHTML = html
    painted.current = html
  }

  // First paint, and any repaint the document earns from outside.
  useEffect(() => {
    paint()
    // Painting is a DOM write from a document that has just arrived; it is the
    // "update an external system with the latest state" an effect is for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const focused = el.contains(document.activeElement)
    // Never repaint under a caret unless something outside said to: that is
    // what stops typing running backwards.
    if (focused && !caretTo.current) return
    paint()
    const put = caretTo.current
    caretTo.current = null
    if (put) placeIn(el, put.id, put.offset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.blocks, revision])

  /** Reads the surface back into blocks. */
  const read = (): Line[] => {
    const el = host.current
    if (!el) return []
    const out: Line[] = []
    for (const child of Array.from(el.children)) {
      const node = child as HTMLElement
      const id = node.dataset.blockId
      if (node.dataset.plainLocked === 'true') {
        out.push({ id, text: '' })
        continue
      }
      // The todo marker is painted, not typed, so it is not part of the text.
      const clone = node.cloneNode(true) as HTMLElement
      for (const painted of Array.from(clone.querySelectorAll('[contenteditable="false"]'))) {
        painted.remove()
      }
      const text = clone.textContent ?? ''
      // An empty line is empty. The browser leaves a `<br>` in one it has just
      // made, and carrying that back as formatting would mark every fresh
      // paragraph as formatted and rewrite the document on every Enter.
      out.push({ id, text, html: text ? sanitizeInline(clone.innerHTML) : undefined })
    }
    return out
  }

  const onInput = () => {
    const el = host.current
    if (!el) return
    const lines = read()
    const blocks = reconcile(doc.blocks, lines)
    if (blocks === doc.blocks) return

    /*
      Put the new ids back onto the lines, before anything reads the caret.

      Pressing Enter clones the paragraph's element, `data-block-id` and all,
      so the browser leaves two lines wearing one id. `reconcile` gives the
      second a new block, and until the DOM is told, every question of the form
      "which line is the caret on" answers with the line above. Stamping is a
      write to an attribute, never to a text node, so the caret does not feel
      it — and it is what lets this surface go for a whole paragraph without a
      repaint.
    */
    const children = Array.from(el.children)
    if (children.length === blocks.length) {
      for (let i = 0; i < blocks.length; i++) {
        const node = children[i] as HTMLElement
        if (node.dataset.blockId !== blocks[i].id) node.dataset.blockId = blocks[i].id
      }
    }

    /*
      The markdown shortcuts, applied to the line the caret is in and nowhere
      else. A word processor turns "# " into a heading and so does this; doing
      it to every line on every keystroke would rewrite paragraphs somebody is
      not in.
    */
    const at = caretLine(el)
    const index = at ? blocks.findIndex((block) => block.id === at) : -1
    const here = index === -1 ? null : blocks[index]
    if (here && (isTextish(here) || here.type === 'todo')) {
      const shortcut = shortcutFor(here.text)
      if (shortcut && shortcut.type !== 'divider') {
        const converted = convert(here, shortcut)
        const next = [...blocks]
        next[index] = converted
        caretTo.current = { id: converted.id, offset: 0 }
        onChange({ ...doc, blocks: next, updatedAt: Date.now() })
        return
      }
    }

    onChange({ ...doc, blocks, updatedAt: Date.now() })
  }

  /**
   * Paste, parsed into lines rather than dropped in as markup.
   *
   * The browser's own paste would carry a web page's styling, its links and
   * whatever else, straight into the document. `parseClipboard` is the same
   * scanner the block surface uses, so a paste keeps its shape in both.
   */
  const onPaste = (event: React.ClipboardEvent) => {
    const html = event.clipboardData.getData('text/html')
    const plain = event.clipboardData.getData('text/plain')
    if (!html && !plain) return
    event.preventDefault()
    const pasted = parseClipboard(html, plain)
    if (!pasted.length) return
    const created = blocksFromPasted(pasted)
    const el = host.current
    const at = el ? caretLine(el) : null
    const index = at ? doc.blocks.findIndex((block) => block.id === at) : -1
    const next = [...doc.blocks]
    const hostBlock = index === -1 ? null : doc.blocks[index]
    const hostEmpty =
      hostBlock && (isTextish(hostBlock) || hostBlock.type === 'todo') && !hostBlock.text.trim()
    if (index === -1) next.push(...created)
    else next.splice(hostEmpty ? index : index + 1, hostEmpty ? 1 : 0, ...created)
    const last = created[created.length - 1]
    caretTo.current = last ? { id: last.id, offset: Number.MAX_SAFE_INTEGER } : null
    onChange({ ...doc, blocks: next, updatedAt: Date.now() })
  }

  const empty = doc.blocks.every((block) => !blockText(block).trim())

  return (
    <div className="relative">
      {/*
        The placeholder is painted behind rather than set on the element:
        `:empty` is false the moment the browser puts its own <br> in, which it
        does as soon as anything is typed and undone.
      */}
      {empty && (
        <p
          aria-hidden
          className="pointer-events-none absolute top-1 left-0 text-[var(--color-faint)]"
        >
          Write something
        </p>
      )}
      <div
        ref={host}
        role="textbox"
        aria-multiline="true"
        aria-label="Document"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onInput={onInput}
        onPaste={onPaste}
        // pre-wrap, because HTML collapses a leading space and somebody
        // indenting a line by hand should keep it. The same reason the block
        // surface has it.
        className="pad-doc min-h-[60vh] whitespace-pre-wrap outline-none"
      />
    </div>
  )
}

/** Turns the caret's position into the id of the line it is on. */
function caretLine(host: HTMLElement): string | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  let node: Node | null = selection.getRangeAt(0).startContainer
  while (node && node !== host) {
    const el = node as HTMLElement
    if (el.dataset?.blockId) return el.dataset.blockId
    node = node.parentNode
  }
  return null
}

/** Puts the caret at an offset inside one line, after a repaint. */
function placeIn(host: HTMLElement, id: string, offset: number) {
  const line = host.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`)
  if (!line) return
  const range = document.createRange()
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let last: Text | null = null
  while (walker.nextNode()) {
    const text = walker.currentNode as Text
    if (remaining <= text.data.length) {
      range.setStart(text, remaining)
      range.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      return
    }
    remaining -= text.data.length
    last = text
  }
  range.selectNodeContents(last ?? line)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/** Applies a markdown shortcut to a block, keeping what it should keep. */
function convert(block: Block, shortcut: { type: Block['type']; level?: 1 | 2 | 3; ordered?: boolean }): Block {
  const next = { ...block, type: shortcut.type, text: '' } as Block
  const shaped = next as TextishBlock & { ordered?: boolean; done?: boolean }
  delete shaped.html
  if (shortcut.level) shaped.level = shortcut.level
  else delete shaped.level
  if (shortcut.ordered) shaped.ordered = true
  else delete shaped.ordered
  if (shortcut.type === 'todo') shaped.done = false
  return next
}

/** What a block that cannot be typed into here says about itself. */
function describe(block: Block): string {
  const names: Partial<Record<Block['type'], string>> = {
    table: 'Spreadsheet',
    code: 'Code',
    form: 'Form',
    file: 'File attachment',
    divider: 'Horizontal line',
  }
  return `${names[block.type] ?? 'Block'} — kept here, edited in Blocks mode`
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
