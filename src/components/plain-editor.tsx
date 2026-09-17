'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { beautify, continues, type Current } from '@/lib/beautify'
import { makeBlock } from '@/lib/blocks'
import { parseClipboard } from '@/lib/paste'
import { blocksFromPasted } from '@/lib/blocks'
import { applyShape, editableInPlain, reconcile, type Line } from '@/lib/plain-doc'
import { blockHtml, escapeHtml, sanitizeInline } from '@/lib/rich-text'
import { colonStartsList, looksLikeTitle, MAX_INDENT, nextIndent } from '@/lib/smart-typing'
import { blockText, isTextish, type Block, type Doc, type TextishBlock } from '@/lib/types'
import CodeBlock from './code-block'
import FileBlock from './file-block'
import FormBlock from './form-block'
import TableBlock from './table-block'
import { bindSmartTyping } from './typing'

/**
 * The writing page: one document, typed the way a document is typed.
 *
 * ## What this is
 *
 * A run of paragraphs is one `contenteditable`, so the browser does the things
 * a browser is good at: Enter makes a line, Ctrl+A takes the whole page, a
 * selection runs from the first word to the last and copies as one piece, and
 * the caret behaves the way it does in every text box ever made. None of that
 * is reimplemented here, which is the entire argument for this shape — the app
 * that used to own every paragraph separately had to hand-write all three and
 * got each of them slightly wrong.
 *
 * A spreadsheet, some code, a form or a file is not text, so it is not inside
 * that element: it sits between two runs as an ordinary component. Documents
 * that are only writing — which is nearly all of them — are therefore one
 * editable element and behave perfectly; a document with a spreadsheet in the
 * middle is two, and the only thing that costs is a selection that stops at
 * the spreadsheet.
 *
 * ## Why React does not paint the paragraphs
 *
 * Because React must not own text while somebody is typing. A keystroke that
 * goes to state and comes back as a re-render rebuilds the text nodes and
 * throws the caret to the start. So React owns the *structure* — which runs
 * exist, and what sits between them — and each run owns its own paragraphs,
 * painting them once and then leaving the browser alone until something
 * outside the surface changes the document.
 *
 * ## Lines that finish themselves
 *
 * People write "- " before a list, "[]" before something to do and "#" before
 * a title, because that is how notes have always been written. When the caret
 * leaves a line, `lib/beautify.ts` reads what is there and gives it the shape
 * it was plainly aiming at. Nothing is predicted and no model is involved:
 * they are string comparisons, they run offline and free, and every one of
 * them is a unit test. Nothing rewrites a word — markers come off because they
 * were notation, and emphasis is painted rather than retyped.
 *
 * On leaving the line, never during it, for the same reason a spell-checker
 * does not argue with a half-typed word: "#" is a heading and "# " is the
 * start of one, but "- " in the middle of a thought is a dash.
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
  /**
   * The line the caret is on, so the toolbar knows what it is describing.
   *
   * Reported rather than asked for, because the page owns the caret and
   * anything above it reading the DOM to find out would be reading a value
   * React cannot see change.
   */
  onCaret: (id: string | null) => void
  onExtractPdf?: (file: Blob, name: string) => void
}

/** One run of consecutive paragraphs, or one block that is not text. */
type Group =
  | { kind: 'run'; key: string; from: number; blocks: Block[] }
  | { kind: 'block'; key: string; at: number; block: Block }

/** Splits the document into what one editable element can hold, and the rest. */
function group(blocks: Block[]): Group[] {
  const out: Group[] = []
  let run: Block[] = []
  let from = 0
  /*
    A run's key is the block that ends the run before it, so adding or deleting
    a paragraph never changes it — only inserting a spreadsheet does, and that
    is a repaint anybody would expect. Keying by the first paragraph would
    remount the whole run, and lose the caret, the first time its opening line
    was deleted.
  */
  let after = 'head'
  const flush = () => {
    if (!run.length) return
    out.push({ kind: 'run', key: `run-${after}`, from, blocks: run })
    run = []
  }
  blocks.forEach((block, at) => {
    if (editableInPlain(block)) {
      if (!run.length) from = at
      run.push(block)
      return
    }
    flush()
    out.push({ kind: 'block', key: block.id, at, block })
    after = block.id
  })
  flush()
  return out
}

export default function PlainEditor({
  doc,
  onChange,
  revision,
  onCaret,
  onExtractPdf,
}: PlainEditorProps) {
  /**
   * The newest document, readable from a handler made earlier.
   *
   * A run paints once and then goes for a whole paragraph without re-running
   * its handlers, so every one of them has to read what is current rather than
   * what was current when it was made. Mirrored in one effect rather than
   * assigned from each action, because the React Compiler forbids mutating a
   * ref inside a memoised callback.
   */
  const latest = useRef(doc)
  useEffect(() => {
    latest.current = doc
  }, [doc])

  const page = useRef<HTMLDivElement>(null)
  const groups = group(doc.blocks)

  /*
    Writing back, always against the newest document rather than the one these
    were made from. Memoised because the React Compiler will not have `Date.now`
    called from something it believes might run during a render.
  */
  const replaceRun = useCallback(
    (from: number, count: number, next: Block[]) => {
      const current = latest.current
      const blocks = [...current.blocks]
      blocks.splice(from, count, ...next)
      onChange({
        ...current,
        blocks: blocks.length ? blocks : [makeBlock('text')],
        updatedAt: Date.now(),
      })
    },
    [onChange],
  )

  const replaceOne = useCallback(
    (at: number, next: Block) => {
      const current = latest.current
      const blocks = [...current.blocks]
      blocks[at] = next
      onChange({ ...current, blocks, updatedAt: Date.now() })
    },
    [onChange],
  )

  const removeOne = useCallback(
    (at: number) => {
      const current = latest.current
      const blocks = current.blocks.filter((_, i) => i !== at)
      onChange({
        ...current,
        blocks: blocks.length ? blocks : [makeBlock('text')],
        updatedAt: Date.now(),
      })
    },
    [onChange],
  )

  /*
    Ctrl+A takes the whole page, even where a spreadsheet has split it into two
    editable elements. Without this the browser stops at the edge of the one
    the caret is in, which reads as select-all being broken.
  */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'a') return
    /*
      Never taken out of a spreadsheet cell, a code block or a form field.
      Inside one of those, Ctrl+A means "select what I am typing in", and a
      handler on the page that answers it with the whole document is a control
      that has stopped working for no reason anybody could see.
    */
    const from = event.target as HTMLElement | null
    if (from?.closest('input, textarea, [data-block-id][contenteditable="false"]')) return
    const el = page.current
    if (!el || groups.filter((entry) => entry.kind === 'run').length < 2) return
    event.preventDefault()
    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  const empty = doc.blocks.every((block) => !blockText(block).trim())

  return (
    <div ref={page} className="pad-doc relative" onKeyDown={onKeyDown}>
      {/*
        Painted behind rather than set on the element: `:empty` stops being
        true the moment the browser puts its own `<br>` in, which it does as
        soon as anything is typed and taken back out again.
      */}
      {empty && (
        <p
          aria-hidden
          className="pointer-events-none absolute top-1 left-0 text-[var(--color-faint)]"
        >
          Write something
        </p>
      )}

      {groups.map((entry) =>
        entry.kind === 'run' ? (
          <TextRun
            key={entry.key}
            blocks={entry.blocks}
            revision={revision}
            opening={entry.from === 0 && !doc.title.trim()}
            onCaret={onCaret}
            onBlocks={(next) => replaceRun(entry.from, entry.blocks.length, next)}
          />
        ) : (
          <div key={entry.key} data-block-id={entry.block.id} className="my-3">
            <Island
              block={entry.block}
              onChange={(next) => replaceOne(entry.at, next)}
              onRemove={() => removeOne(entry.at)}
              onExtractPdf={onExtractPdf}
            />
          </div>
        ),
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- one run */

function TextRun({
  blocks,
  revision,
  opening,
  onCaret,
  onBlocks,
}: {
  blocks: Block[]
  revision: number
  /** True for the run that starts an untitled document. See `enter`. */
  opening: boolean
  onCaret: (id: string | null) => void
  onBlocks: (next: Block[]) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  /** The blocks as this run last painted them, so a read-back has a base. */
  const painted = useRef<Block[]>(blocks)
  /** Where the caret should land after a repaint this run asked for. */
  const caretTo = useRef<{ id: string; offset: number } | null>(null)
  /** The line the caret was on, so leaving it can be noticed. */
  const wasOn = useRef<string | null>(null)
  /** Where the caret was, so a repaint from outside can put it back. */
  const wasAt = useRef<{ id: string; offset: number } | null>(null)
  /** Whether this is the first paint, which is the only one that may focus. */
  const first = useRef(true)
  /** Set by Escape, so the next Tab moves focus instead of indenting. */
  const letGo = useRef(false)
  const [paintKey, setPaintKey] = useState(0)

  /*
    A repaint is asked for by the revision changing, never by typing.

    Adjusted during render rather than in an effect — the pattern this codebase
    uses for "a prop changed, so this state is stale" — because in an effect
    the old text paints for a frame first, which after an undo means the undone
    words are on screen.
  */
  const [seenRevision, setSeenRevision] = useState(revision)
  if (revision !== seenRevision) {
    setSeenRevision(revision)
    setPaintKey((key) => key + 1)
  }

  // Kept in step so handlers read what is current rather than what was.
  const source = useRef(blocks)
  useEffect(() => {
    source.current = blocks
  }, [blocks])

  useEffect(() => {
    const el = host.current
    if (!el) return
    /*
      A repaint that somebody was typing through — an undo, a dictation, a
      style from the toolbar — puts the caret back where it was. Without it,
      pressing a toolbar button drops the caret out of the document, and the
      next thing typed goes nowhere.
    */
    const hadFocus = el.contains(document.activeElement)
    el.innerHTML = source.current.map(lineMarkup).join('')
    painted.current = source.current
    const put = caretTo.current ?? (hadFocus ? wasAt.current : null)
    caretTo.current = null
    if (put) {
      el.focus()
      placeIn(el, put.id, put.offset)
      return
    }
    /*
      A document with nothing in it gets the caret straight away. It is this
      app's oldest promise: the first thing somebody does on opening it can be
      typing, rather than working out where to click. A document that already
      has words is left alone — taking the caret would scroll them away from
      what they came back to read.
    */
    const blank =
      opening &&
      source.current.length === 1 &&
      !blockText(source.current[0]).trim()
    if (first.current && blank) {
      el.focus()
      placeIn(el, source.current[0].id, 0)
    }
    first.current = false
    // Painting is a DOM write from the document that has just arrived, which
    // is the "update an external system with the latest state" an effect is
    // for. It runs on mount and on every repaint this run asks for — never
    // when the document changes, which is what typing does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintKey])

  /*
    A change from somewhere else — an import, a dictation, a batch from the
    Library, a pull from the server — painted as it arrives.

    The test is identity, not focus. Everything this run does to the document
    goes through `publish`, which records exactly what it sent; the array comes
    back rebuilt but holding the same blocks, so a keystroke is recognised and
    ignored. Anything that is not those blocks came from outside and has to be
    painted, caret or no caret — the alternative is an imported PDF that never
    appears because the caret happened to be on the page.

    Straight into the DOM rather than through state: this is the "update an
    external system with the latest state" that an effect is for.
  */
  useEffect(() => {
    const el = host.current
    if (!el) return
    if (sameBlocks(blocks, painted.current)) return
    const hadFocus = el.contains(document.activeElement)
    el.innerHTML = blocks.map(lineMarkup).join('')
    painted.current = blocks
    const put = hadFocus ? wasAt.current : null
    if (put && blocks.some((block) => block.id === put.id)) {
      el.focus()
      placeIn(el, put.id, put.offset)
    }
  }, [blocks])

  /** Reads the run back out of the page. */
  const read = (): Line[] => {
    const el = host.current
    if (!el) return []
    return Array.from(el.children).map((child) => {
      const node = child as HTMLElement
      const box = node.querySelector<HTMLInputElement>('input[type="checkbox"]')
      const clone = node.cloneNode(true) as HTMLElement
      for (const painted of Array.from(clone.querySelectorAll('[contenteditable="false"]'))) {
        painted.remove()
      }
      const text = clone.textContent ?? ''
      return {
        id: node.dataset.blockId,
        text,
        // An empty line is empty. The browser leaves a `<br>` in one it has
        // just made, and carrying that back as formatting would mark every
        // fresh paragraph as formatted and rewrite the document on every Enter.
        html: text ? sanitizeInline(clone.innerHTML) : undefined,
        ...(box ? { done: box.checked } : {}),
      }
    })
  }

  /** What the page says the blocks are now. */
  const current = (): Block[] => reconcile(painted.current, read())

  const publish = (next: Block[]) => {
    painted.current = next
    onBlocks(next)
  }

  const onInput = () => {
    const el = host.current
    if (!el) return
    const next = current()
    if (next === painted.current) return
    /*
      Put the new ids back onto the lines before anything asks which line the
      caret is on.

      Pressing Enter clones the paragraph's element, `data-block-id` and all,
      so two lines wear one id. `reconcile` gives the second a block of its
      own, and until the page is told, every question of that form answers with
      the line above. Stamping is a write to an attribute and never to a text
      node, so the caret does not feel it.
    */
    const children = Array.from(el.children)
    if (children.length === next.length) {
      for (let i = 0; i < next.length; i++) {
        const node = children[i] as HTMLElement
        if (node.dataset.blockId !== next[i].id) node.dataset.blockId = next[i].id
        // A line the browser cloned wears the class of the line it came from.
        const wanted = lineClass(next[i])
        if (node.className !== wanted) node.className = wanted
      }
    }
    publish(next)
  }

  /**
   * Finishes the line the caret has just left.
   *
   * The whole of `lib/beautify.ts` happens here, and only here: while a line
   * is being typed it is left completely alone, because "- " halfway through a
   * thought is a dash and "#" is a word people write.
   */
  const settle = (id: string | null) => {
    const el = host.current
    if (!el || !id) return
    const blocks = current()
    const at = blocks.findIndex((block) => block.id === id)
    if (at === -1) return
    const block = blocks[at]
    if (!isTextish(block) && block.type !== 'todo') return
    const shape = beautify(asCurrent(block))
    if (!shape) {
      if (blocks !== painted.current) publish(blocks)
      return
    }
    const shaped = applyShape(block, shape)
    const next = [...blocks]
    next[at] = shaped
    /*
      Rewritten in place rather than by repainting the run: the caret is on a
      different line by now, and replacing every line under it would take the
      caret with it. One line's markup changing is invisible to a caret that is
      not in it.
    */
    const node = el.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`)
    if (node) node.outerHTML = lineMarkup(shaped)
    publish(next)
  }

  /*
    The first letter of a sentence, capitalised as it is typed.

    The only thing on this page that acts per keystroke rather than when the
    caret leaves the line: a capital that arrives a paragraph later is not a
    capital anybody wanted. One Backspace puts the small letter back, because
    the correction replaces the keystroke rather than rewriting after it.
  */
  useEffect(() => {
    const el = host.current
    if (!el) return
    return bindSmartTyping(
      el,
      () => {
        const id = caretLine(el)
        return id ? el.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`) : null
      },
      () => onInput(),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Notices the caret moving off a line, which is when that line is finished. */
  useEffect(() => {
    const el = host.current
    if (!el) return
    const onSelection = () => {
      if (!el.contains(document.activeElement)) return
      const on = caretLine(el)
      if (on) wasAt.current = { id: on, offset: offsetIn(el, on) }
      if (on === wasOn.current) return
      const left = wasOn.current
      wasOn.current = on
      onCaret(on)
      if (left) settle(left)
    }
    document.addEventListener('selectionchange', onSelection)
    return () => document.removeEventListener('selectionchange', onSelection)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onBlur = () => {
    const left = wasOn.current
    wasOn.current = null
    if (left) settle(left)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const el = host.current
    if (!el) return

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      enter(el)
      return
    }

    /*
      Tab indents the line rather than jumping out of the document.

      It is what Tab does in a word processor and what somebody making a
      sub-list reaches for. Escape first is the way out for anybody moving
      through the page by keyboard: press it, and the next Tab moves focus the
      way it does everywhere else.
    */
    if (event.key === 'Escape') {
      letGo.current = true
      return
    }
    if (event.key === 'Tab') {
      if (letGo.current) {
        letGo.current = false
        return
      }
      const id = caretLine(el)
      if (!id) return
      const blocks = current()
      const at = blocks.findIndex((block) => block.id === id)
      if (at === -1) return
      event.preventDefault()
      const offset = offsetIn(el, id)
      const shaped = { ...blocks[at] } as TextishBlock
      const depth = nextIndent(shaped.indent, event.shiftKey ? -1 : 1)
      if (depth) shaped.indent = Math.min(depth, MAX_INDENT)
      else delete shaped.indent
      const next = [...blocks]
      next[at] = shaped as Block
      const node = el.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`)
      if (node) {
        node.className = lineClass(next[at])
        placeIn(el, id, offset)
      }
      publish(next)
      return
    }
    if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Enter') {
      letGo.current = false
    }

    /*
      Backspace at the very start of a line that is something — a bullet, a
      checkbox, a heading, a quote — takes the something off rather than
      joining it to the paragraph above. It is what every editor does, and it
      is the way out of a list that does not involve reaching for a menu.
    */
    if (event.key === 'Backspace') {
      const selection = window.getSelection()
      if (!selection || !selection.isCollapsed) return
      const id = caretLine(el)
      if (!id || offsetIn(el, id) !== 0) return
      const blocks = current()
      const at = blocks.findIndex((block) => block.id === id)
      const block = at === -1 ? null : blocks[at]
      if (!block || block.type === 'text') return
      if (!isTextish(block) && block.type !== 'todo') return
      event.preventDefault()
      const next = [...blocks]
      next[at] = applyShape(block, { type: 'text', text: block.text, html: block.html })
      const node = el.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`)
      if (node) {
        node.outerHTML = lineMarkup(next[at])
        placeIn(el, id, 0)
      }
      publish(next)
    }
  }

  /**
   * Enter, done by hand rather than left to the browser.
   *
   * The browser's own Enter clones the element it is in, class and id and all,
   * so pressing it at the end of a heading gives you a second heading and
   * pressing it in a list gives you a line that only looks like an item. Doing
   * it here means the line being left is finished first, the new line is the
   * kind that should follow it, and an empty list item drops out of the list —
   * which is the one thing everybody expects and nothing does by default.
   */
  const enter = (el: HTMLElement) => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const id = caretLine(el)
    if (!id) return
    const node = el.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`)
    if (!node) return

    const blocks = current()
    const at = blocks.findIndex((block) => block.id === id)
    if (at === -1) return

    const range = selection.getRangeAt(0)
    const { before, after } = splitAt(node, range)

    // Finish the line being left, reading it as it is before the split.
    const asTyped = { ...blocks[at] } as Block
    if (isTextish(asTyped) || asTyped.type === 'todo') {
      asTyped.text = before.text
      if (before.html) asTyped.html = before.html
      else delete (asTyped as { html?: string }).html
    }
    const shape = beautify(asCurrent(asTyped))
    let finished = shape ? applyShape(asTyped, shape) : asTyped

    /*
      The opening line of a document that has no title yet becomes its heading.

      Only at the moment Enter is pressed, only on the first line, and only
      when it reads like a title rather than the start of a sentence — short,
      unpunctuated, a handful of words. It is the one line of a note that is
      almost always its name, and typing it twice is the thing nobody does.
    */
    if (opening && at === 0 && finished.type === 'text' && looksLikeTitle(before.text)) {
      finished = applyShape(finished, {
        type: 'heading',
        level: 1,
        text: blockText(finished),
        html: (finished as TextishBlock).html,
      })
    }

    const next = [...blocks]

    /*
      An empty list item and Enter: leave the list rather than adding another
      empty one. Checked after the line has been finished, so typing "- " and
      pressing Enter twice ends with a paragraph and not a stray bullet.
    */
    const listy = finished.type === 'bullet' || finished.type === 'todo'
    if (listy && !before.text.trim() && !after.text.trim()) {
      next[at] = applyShape(finished, { type: 'text', text: '' })
      caretTo.current = { id: next[at].id, offset: 0 }
      publish(next)
      setPaintKey((key) => key + 1)
      return
    }

    /*
      A line that announces a list starts one. "Next steps:" and then Enter is
      somebody about to write a list, and every word processor has known that
      for thirty years — the alternative is typing "- " on the line you were
      always going to type it on.
    */
    const announced =
      finished.type === 'text' && colonStartsList(blockText(finished))
        ? { type: 'bullet' as const, ordered: undefined }
        : null
    const carry =
      announced ?? continues(finished.type, (finished as { ordered?: boolean }).ordered)
    const fresh = makeBlock(carry.type)
    if (isTextish(fresh) || fresh.type === 'todo') {
      fresh.text = after.text
      if (after.html) fresh.html = after.html
    }
    if (carry.ordered && fresh.type === 'bullet') fresh.ordered = true
    const indent = (finished as TextishBlock).indent
    if (indent) (fresh as TextishBlock).indent = indent

    next[at] = finished
    next.splice(at + 1, 0, fresh)
    caretTo.current = { id: fresh.id, offset: 0 }
    wasOn.current = fresh.id
    publish(next)
    setPaintKey((key) => key + 1)
  }

  /**
   * Paste, parsed into lines rather than dropped in as markup.
   *
   * The browser's own paste carries a web page's styling, its links and
   * whatever else straight into the document. `parseClipboard` is a string
   * scanner with no DOM in it, so Word's nested divs, a list inside a list and
   * a hard-wrapped email are all unit tested rather than found out later.
   */
  const onPaste = (event: React.ClipboardEvent) => {
    const el = host.current
    if (!el) return
    const html = event.clipboardData.getData('text/html')
    const plain = event.clipboardData.getData('text/plain')
    if (!html && !plain) return
    const pasted = parseClipboard(html, plain)
    if (!pasted.length) return
    event.preventDefault()

    const created = blocksFromPasted(pasted)
    const blocks = current()
    const id = caretLine(el)
    const at = id ? blocks.findIndex((block) => block.id === id) : -1
    const host_ = at === -1 ? null : blocks[at]
    const intoEmpty =
      host_ && (isTextish(host_) || host_.type === 'todo') && !host_.text.trim()
    const next = [...blocks]
    if (at === -1) next.push(...created)
    else next.splice(intoEmpty ? at : at + 1, intoEmpty ? 1 : 0, ...created)
    const last = created[created.length - 1]
    caretTo.current = last ? { id: last.id, offset: Number.MAX_SAFE_INTEGER } : null
    publish(next)
    setPaintKey((key) => key + 1)
  }

  return (
    <div
      ref={host}
      role="textbox"
      aria-multiline="true"
      aria-label="Document"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onInput={onInput}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onBlur={onBlur}
      // pre-wrap, because HTML collapses a leading space and somebody
      // indenting a line by hand should keep it.
      className="pad-plain min-h-[8rem] whitespace-pre-wrap outline-none"
    />
  )
}

/* -------------------------------------------------------------- the islands */

/**
 * A block that is not writing, sitting between two runs.
 *
 * It keeps its own copy while it is on screen, because the runs around it do
 * not repaint while somebody is typing and a spreadsheet that only redrew on
 * a repaint would be a spreadsheet you could not see yourself filling in. The
 * copy is seeded again whenever the document is rewritten from outside, which
 * is what an undo does.
 */
function Island({
  block,
  onChange,
  onRemove,
  onExtractPdf,
}: {
  block: Block
  onChange: (next: Block) => void
  onRemove: () => void
  onExtractPdf?: (file: Blob, name: string) => void
}) {
  const [mine, setMine] = useState(block)
  const [seen, setSeen] = useState(block)
  if (block !== seen) {
    setSeen(block)
    // Only when it was changed somewhere else: our own edit comes back as the
    // same value and re-seeding from it would fight the cell being typed in.
    if (block !== mine) setMine(block)
  }

  const change = (next: Block) => {
    setMine(next)
    onChange(next)
  }

  if (mine.type === 'divider') {
    return <hr className="my-6 border-0 border-t border-[var(--color-line)]" />
  }
  if (mine.type === 'table') return <TableBlock block={mine} onChange={change} />
  if (mine.type === 'code') return <CodeBlock block={mine} onChange={change} />
  if (mine.type === 'form') return <FormBlock block={mine} onChange={change} />
  if (mine.type === 'file') {
    return (
      <FileBlock block={mine} onChange={change} onRemove={onRemove} onExtractPdf={onExtractPdf} />
    )
  }
  return null
}

/* --------------------------------------------------------------- painting */

/** One line of the page, as markup. The only place a line is drawn. */
function lineMarkup(block: Block): string {
  const id = escapeHtml(block.id)
  const body = blockHtml({ text: blockText(block), html: (block as TextishBlock).html }) || '<br>'
  if (block.type === 'todo') {
    const ticked = (block as { done?: boolean }).done ? ' checked' : ''
    // Named after the task, so a screen reader and a test both say which one.
    const label = escapeHtml(blockText(block) || 'Task')
    return (
      `<div data-block-id="${id}" class="${lineClass(block)}">` +
      `<input type="checkbox" contenteditable="false"${ticked} aria-label="${label}" ` +
      `class="mr-2 h-[0.85em] w-[0.85em] translate-y-[0.1em] shrink-0 cursor-pointer accent-[var(--color-accent)]">` +
      `${body}</div>`
    )
  }
  return `<div data-block-id="${id}" class="${lineClass(block)}">${body}</div>`
}

/** The class a line wears, so its kind reads as itself. */
function lineClass(block: Block): string {
  const shaped = block as TextishBlock
  const align =
    shaped.align === 'center'
      ? ' pad-align-center'
      : shaped.align === 'right'
        ? ' pad-align-right'
        : shaped.align === 'justify'
          ? ' pad-align-justify'
          : ''
  const indent = shaped.indent ? ` pad-indent-${Math.min(shaped.indent, 4)}` : ''
  if (block.type === 'heading') {
    const styles: Record<number, string> = {
      1: 'pad-h1 font-semibold tracking-tight mt-6 mb-1',
      2: 'pad-h2 font-semibold tracking-tight mt-5 mb-0.5',
      3: 'pad-h3 font-semibold mt-4',
    }
    // Sticky, so the heading of the section you are reading stays on screen.
    // See `.pad-sticky-heading` in globals.css for why it parks where it does.
    return `pad-sticky-heading ${styles[shaped.level ?? 1]}${align}${indent}`
  }
  if (block.type === 'quote') {
    return 'py-1 pl-3 border-l-2 border-[var(--color-line)] italic text-[var(--color-muted)]' + align + indent
  }
  if (block.type === 'bullet') {
    return (shaped.ordered ? 'pad-ol py-0.5' : 'pad-ul py-0.5') + align + indent
  }
  if (block.type === 'todo') return 'py-0.5' + align + indent
  return 'py-1' + align + indent
}

/* ----------------------------------------------------------- caret and text */

/** What `beautify` needs to know about a line. */
function asCurrent(block: Block): Current {
  const shaped = block as TextishBlock & { ordered?: boolean; done?: boolean }
  return {
    type: block.type,
    level: shaped.level,
    ordered: shaped.ordered,
    done: shaped.done,
    text: blockText(block),
    html: shaped.html,
  }
}

/** The id of the line the caret is on. */
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

/** How far into its line the caret is, in characters. */
function offsetIn(host: HTMLElement, id: string): number {
  const line = host.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`)
  const selection = window.getSelection()
  if (!line || !selection || selection.rangeCount === 0) return 0
  const range = selection.getRangeAt(0)
  if (!line.contains(range.startContainer)) return 0
  const measure = range.cloneRange()
  measure.selectNodeContents(line)
  measure.setEnd(range.startContainer, range.startOffset)
  return measure.toString().length
}

/** The two halves of a line, either side of the caret, formatting and all. */
function splitAt(
  line: HTMLElement,
  range: Range,
): { before: { text: string; html?: string }; after: { text: string; html?: string } } {
  const read = (fragment: DocumentFragment) => {
    const box = document.createElement('div')
    box.append(fragment)
    for (const painted of Array.from(box.querySelectorAll('[contenteditable="false"]'))) {
      painted.remove()
    }
    const text = box.textContent ?? ''
    return { text, html: text ? sanitizeInline(box.innerHTML) : undefined }
  }
  const head = range.cloneRange()
  head.selectNodeContents(line)
  head.setEnd(range.startContainer, range.startOffset)
  const tail = range.cloneRange()
  tail.selectNodeContents(line)
  tail.setStart(range.endContainer, range.endOffset)
  return { before: read(head.cloneContents()), after: read(tail.cloneContents()) }
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
      select(range)
      return
    }
    remaining -= text.data.length
    last = text
  }
  if (last) {
    range.setStart(last, last.data.length)
    range.collapse(true)
  } else {
    range.selectNodeContents(line)
    range.collapse(true)
  }
  select(range)
}

/** Whether two runs of blocks are the same blocks, in the same order. */
function sameBlocks(a: Block[], b: Block[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function select(range: Range) {
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}
