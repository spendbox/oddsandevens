'use client'

import { FolderOpen } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { makeBlock } from '@/lib/blocks'
import { applyShape } from '@/lib/plain-doc'
import { MAX_INDENT, nextIndent } from '@/lib/smart-typing'
import type { Align, Block, BlockType, Doc, TextishBlock } from '@/lib/types'
import { blockText, isTextish } from '@/lib/types'
import { TEXT, usePref } from '@/lib/ui-prefs'
import ActionPlan from './action-plan'
import DictationButton from './dictation-button'
import { KindLine } from './note-kind'
import FormatToolbar from './format-toolbar'
import PlainEditor from './plain-editor'
import Ribbon, { type RibbonTarget } from './ribbon'

/**
 * The document editor.
 *
 * ## One writing surface
 *
 * A document is still a list of blocks — that rule has not moved, and it is
 * what lets a spreadsheet sit inside a meeting note. What has gone is the idea
 * that the person typing should ever meet one. There is no block editor to
 * switch into, no menu bound to a character, no handle in the margin, nothing
 * to drag. You type on a page, the way you type on a page, and the lines
 * finish themselves as you leave them.
 *
 * The surface itself is plain-editor.tsx: a run of paragraphs is one editable
 * element, so Enter, Ctrl+A, selection and copy are the browser's own rather
 * than three hundred lines imitating them. The one thing left here is the
 * chrome around it — the title, the toolbar, and the two buttons that read the
 * page back or listen to it.
 *
 * ## Why the toolbar still acts on blocks
 *
 * Because a paragraph style *is* a block type, and always was. Pressing
 * Heading 1 changes the kind of the line the caret is on; the page repaints
 * that run and puts the caret back where it was. The same route the beautifier
 * takes when it reads "# " off a line somebody typed, which is why both end up
 * calling `applyShape`.
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
  onBack,
  onMenu,
  saving,
  folder,
  covered = false,
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
   * It is added to this editor's own revision before being handed down,
   * because the writing page deliberately refuses to repaint while somebody is
   * typing — and without this, undoing while the caret is in the paragraph
   * being undone would leave the old text on screen.
   */
  externalRevision?: number
  /**
   * Whether the model is configured. Asked once by the workspace and handed
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
  /** Back to the notes. */
  onBack: () => void
  /** Opens the menu holding this note's settings. */
  onMenu: () => void
  /** True while the last keystrokes are still on their way to the disk. */
  saving: boolean
  /** The folder this note is filed in, when it is in one. */
  folder?: string
  /**
   * True when something is open over this note — the notes screen, or search.
   *
   * The recorder is a portal pinned to the corner of the window, so it goes on
   * floating over whatever covers the note. The notes screen has a recorder of
   * its own, and two identical microphone buttons in one corner is one of them
   * doing something other than what it looks like.
   */
  covered?: boolean
}) {
  /**
   * Incremented whenever this editor rewrites the page itself rather than the
   * user typing it — a style from the toolbar, an insert, an undo. The writing
   * page watches it to know when a repaint must override its "never repaint
   * while somebody is typing" rule.
   */
  const [revision, setRevision] = useState(0)
  const paintRevision = revision + externalRevision
  const bumpRevision = () => setRevision((r) => r + 1)

  /**
   * The line the caret is in, as far as the toolbar cares.
   *
   * Not cleared when the page loses focus: pressing a toolbar button moves
   * focus out of the page for an instant, and forgetting where the caret was
   * at exactly that moment would make every button a no-op.
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

  /*
    Undo and redo, taken over from the browser.

    The browser keeps its own stack per editable element, which knows nothing
    about a style applied from the toolbar, a block inserted, a dictation
    written in or a whole page replaced. Two undo systems that disagree is
    worse than one that is slightly coarser, so this one wins and the native
    one is prevented. See lib/history.ts.
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

  /* ------------------------------------------------------------- the toolbar */

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

  /** Rewrites the line the caret is in, and repaints it with the caret kept. */
  const changeCurrent = (make: (block: Block) => Block) => {
    const at = currentId ? doc.blocks.findIndex((b) => b.id === currentId) : -1
    if (at === -1) return
    const next = [...doc.blocks]
    next[at] = make(next[at])
    setBlocks(next)
    bumpRevision()
  }

  const styleCurrent = (choice: { type: BlockType; level?: 1 | 2 | 3; ordered?: boolean }) =>
    changeCurrent((block) =>
      applyShape(block, {
        type: choice.type,
        level: choice.level,
        ordered: choice.ordered,
        done: (block as { done?: boolean }).done,
        text: blockText(block),
        html: (block as TextishBlock).html,
      }),
    )

  const alignCurrent = (align: Align) =>
    changeCurrent((block) => {
      const next = { ...block } as TextishBlock
      if (align === 'left') delete next.align
      else next.align = align
      return next as Block
    })

  const indentCurrent = (by: -1 | 1) =>
    changeCurrent((block) => {
      const next = { ...block } as TextishBlock
      const depth = nextIndent(next.indent, by)
      if (depth) next.indent = Math.min(depth, MAX_INDENT)
      else delete next.indent
      return next as Block
    })

  /** Insert from the toolbar: a spreadsheet, some code, a form, a line. */
  const insertFromToolbar = (type: BlockType) => {
    const created = makeBlock(type)
    const at = currentId ? doc.blocks.findIndex((b) => b.id === currentId) : -1
    const next = [...doc.blocks]
    const host = at === -1 ? null : next[at]
    const intoEmpty = host && (isTextish(host) || host.type === 'todo') && !host.text.trim()
    if (at === -1) next.push(created)
    else next.splice(intoEmpty ? at : at + 1, intoEmpty ? 1 : 0, created)
    /*
      A block that is not text is not something you can type after, so a fresh
      paragraph follows it. Without one, inserting a spreadsheet at the end of
      a document leaves nowhere to carry on writing.
    */
    const after = next[next.findIndex((b) => b.id === created.id) + 1]
    if (!after || !(isTextish(after) || after.type === 'todo')) {
      next.splice(next.findIndex((b) => b.id === created.id) + 1, 0, makeBlock('text'))
    }
    setBlocks(next)
    bumpRevision()
  }

  /* ------------------------------------------------------------------ render */

  /*
    The text size lives on <html> and in localStorage rather than in React
    state, so it is applied before the first paint and does not flash. Unset
    means medium, which is already the larger default. See lib/ui-prefs.ts.
  */
  const { value: textPref, set: setTextPref } = usePref(TEXT)
  const textSize = textPref ?? 'medium'

  return (
    <div ref={container} className="relative">
      <Ribbon
        target={ribbonTarget}
        onBack={onBack}
        onMenu={onMenu}
        saving={saving}
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

      <div className="px-4 pt-5 pb-32 sm:px-12 sm:pt-8">
        <FormatToolbar scope={container} />

        {/*
          What this note is, and when it was last written in.

          Above the title rather than beside it, because it is the sentence you
          read first — "a meeting, from this afternoon" — and because the line
          the eye lands on next should be the note's own name. The folder is on
          the same line when there is one: it is the third fact of the same
          kind, and a bar of its own across the top was a row of things that
          were not the note.
        */}
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <KindLine doc={doc} />
          {folder && (
            <p
              aria-label="Folder"
              className="flex items-center gap-1 text-[13px] text-[var(--color-muted)]"
            >
              <FolderOpen size={13} />
              {folder}
            </p>
          )}
        </div>

        <input
          value={doc.title}
          onChange={(e) => onChange({ ...doc, title: e.target.value, updatedAt: Date.now() })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'ArrowDown') {
              e.preventDefault()
              const first = container.current?.querySelector<HTMLElement>('[role="textbox"]')
              first?.focus()
            }
          }}
          placeholder="Untitled"
          aria-label="Note title"
          className="pad-doc-title mb-3 w-full bg-transparent font-semibold tracking-tight outline-none placeholder:text-[var(--color-faint)]"
        />

        <PlainEditor
          doc={doc}
          onChange={onChange}
          revision={paintRevision}
          onCaret={setCurrentId}
          onExtractPdf={onExtractPdf}
        />
      </div>

      {/*
        Speech into the note. It writes where the caret is, or at the end when
        there is no caret — which is where somebody who has just pressed record
        and talked for ten minutes expects their meeting to appear.
      */}
      {!covered && (
        <DictationButton
          title={doc.title}
          aiReady={aiReady}
          onWrite={(pasted) => {
            if (!pasted.length) return
            const created = pasted.map((item) => {
              const made = makeBlock(item.type, item.level)
              if (isTextish(made) || made.type === 'todo') {
                made.text = item.text
                made.html = item.html
                made.indent = item.indent
              }
              if (made.type === 'code') made.code = item.text
              return made
            })
            const at = currentId ? doc.blocks.findIndex((b) => b.id === currentId) : -1
            const next = [...doc.blocks]
            const host = at === -1 ? null : next[at]
            const intoEmpty = host && (isTextish(host) || host.type === 'todo') && !host.text.trim()
            if (at === -1) next.push(...created)
            else next.splice(intoEmpty ? at : at + 1, intoEmpty ? 1 : 0, ...created)
            setBlocks(next)
            bumpRevision()
          }}
        />
      )}

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
