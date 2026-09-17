'use client'

import { ChevronLeft, Ellipsis } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { makeBlock } from '@/lib/blocks'
import type { Block, Doc } from '@/lib/types'
import { isTextish } from '@/lib/types'
import DictationButton from './dictation-button'
import { KindLine } from './note-kind'
import NoteMenu from './note-menu'
import PlainEditor from './plain-editor'

/**
 * One note, open.
 *
 * ## What is on the screen
 *
 * The way back to the notes, a word saying it is saved, and a ⋯. Under that,
 * in green, what kind of note this is and when it was last written in. Then
 * its name, then the writing. That is the whole of it.
 *
 * It had a toolbar: undo, redo, a style menu, five marks, four kinds of list,
 * alignment, indent, the size of the type, Insert, and an action button. All
 * of it correct, all of it reachable, and collectively a band of grey
 * furniture across the top of a page somebody opened to write on. The writing
 * still formats itself — type "- " and you get a bullet, "# " and you get a
 * heading — because that is what people already do in a text file and it costs
 * no control on a bar. What went is the controls, not the formatting.
 *
 * ## Why the title is never demanded
 *
 * Because "Untitled" is a box somebody has to fill in before they can write,
 * and a note's first line almost always says what the note is. So it is filled
 * in from the writing — by the model when a note is composed, by the opening
 * line otherwise — and it stays an ordinary editable field, because a name
 * that cannot be corrected is worse than no name.
 */
export default function Editor({
  doc,
  onChange,
  onUndo,
  onRedo,
  externalRevision = 0,
  aiReady,
  onBack,
  onFavorite,
  onDelete,
  accountId,
  saving,
  covered = false,
}: {
  doc: Doc
  onChange: (next: Doc) => void
  onUndo: () => void
  onRedo: () => void
  /**
   * Bumped by whatever owns the history when it puts an older note back.
   *
   * It is added to this editor's own revision before being handed down,
   * because the writing page deliberately refuses to repaint while somebody is
   * typing — and without this, undoing while the caret is in the paragraph
   * being undone would leave the old text on screen.
   */
  externalRevision?: number
  /** Whether the model is configured. Asked once, by the workspace. */
  aiReady: boolean
  /** Back to the notes. */
  onBack: () => void
  onFavorite: (favorite: boolean) => void
  onDelete: () => void
  /** Null when nobody is signed in, which is what sharing requires. */
  accountId: string | null
  /** True while the last keystrokes are still on their way to the disk. */
  saving: boolean
  /**
   * True when something is open over this note — the notes screen, or search.
   *
   * The recorder is a portal pinned to the corner of the window, so it goes on
   * floating over whatever covers the note, and two identical microphone
   * buttons in one corner is one of them doing something other than what it
   * looks like.
   */
  covered?: boolean
}) {
  /**
   * Incremented whenever this editor rewrites the page itself rather than the
   * user typing it — a dictation, an undo. The writing page watches it to know
   * when a repaint must override its "never repaint while somebody is typing"
   * rule.
   */
  const [revision, setRevision] = useState(0)
  const paintRevision = revision + externalRevision
  const [menu, setMenu] = useState(false)
  /** The line the caret is in, so a dictation knows where to write. */
  const [currentId, setCurrentId] = useState<string | null>(null)

  const container = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLTextAreaElement>(null)

  /*
    The title grows to fit what is in it.

    A DOM write from the value that has just arrived, which is what an effect
    is for — and it has to run on every change rather than on mount, because
    the name can be replaced from outside (an undo, a sync) as well as typed.
  */
  useEffect(() => {
    const el = title.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [doc.title])

  const setBlocks = useCallback(
    (blocks: Block[]) => onChange({ ...doc, blocks, updatedAt: Date.now() }),
    [doc, onChange],
  )

  /*
    Undo and redo, taken over from the browser.

    The browser keeps its own stack per editable element, which knows nothing
    about a dictation written in or a whole page replaced. Two undo systems
    that disagree is worse than one that is slightly coarser, so this one wins
    and the native one is prevented. See lib/history.ts.
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

  return (
    <div ref={container} className="relative">
      <div
        role="toolbar"
        data-print="hide"
        // Opaque, not 95% with a blur behind it: the page scrolls underneath
        // this and the words showed through, which on a bar that never moves
        // reads as a rendering fault rather than as a material.
        className="sticky top-0 z-20 flex items-center gap-1 border-b border-[var(--color-line)] bg-[var(--color-paper)] px-1.5 py-1.5 sm:px-2"
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to notes"
          className="flex h-9 shrink-0 items-center gap-0.5 rounded-lg pr-2 pl-1 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
        >
          <ChevronLeft size={19} />
          Notes
        </button>

        {/*
          The one word this app says about saving.

          In the middle, in grey, and never a button: there is nothing to
          press, which is the point being made. It says "Saving…" for the few
          hundred milliseconds between a keystroke and the disk, so the word is
          demonstrably live rather than a label printed on the bar.
        */}
        <p
          role="status"
          aria-live="polite"
          className="min-w-0 flex-1 truncate text-center text-[13px] text-[var(--color-faint)]"
        >
          {saving ? 'Saving…' : 'Saved'}
        </p>

        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="More"
            aria-expanded={menu}
            onClick={() => setMenu((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
          >
            <Ellipsis size={18} />
          </button>
          {menu && (
            <NoteMenu
              doc={doc}
              accountId={accountId}
              onFavorite={onFavorite}
              onDelete={onDelete}
              onClose={() => setMenu(false)}
            />
          )}
        </div>
      </div>

      <div className="px-4 pt-5 pb-32 sm:px-12 sm:pt-8">
        {/*
          What this note is, and when it was last written in. Above the title
          because it is the sentence you read first — "a meeting, from this
          afternoon" — and because the line the eye lands on next should be the
          note's own name.
        */}
        <div className="mb-1.5">
          <KindLine doc={doc} />
        </div>

        {/*
          The name, which wraps.

          It was an `<input>`, and an input does not wrap: a title written for
          somebody by the model is often eight or nine words, and it ran off
          the right-hand edge of a phone with nothing to say it had. A textarea
          that grows to its content is the same field with the one property
          this needs.
        */}
        <textarea
          ref={title}
          value={doc.title}
          rows={1}
          onChange={(e) => onChange({ ...doc, title: e.target.value, updatedAt: Date.now() })}
          onKeyDown={(e) => {
            // Return in a title means "start writing", not a second line of
            // name — which is what a textarea would otherwise do.
            if (e.key === 'Enter' || e.key === 'ArrowDown') {
              e.preventDefault()
              const first = container.current?.querySelector<HTMLElement>('[role="textbox"]')
              first?.focus()
            }
          }}
          placeholder="Untitled"
          aria-label="Note title"
          className="pad-doc-title mb-3 w-full resize-none overflow-hidden bg-transparent font-semibold tracking-tight outline-none placeholder:text-[var(--color-faint)]"
        />

        <PlainEditor doc={doc} onChange={onChange} revision={paintRevision} onCaret={setCurrentId} />
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
              return made
            })
            const at = currentId ? doc.blocks.findIndex((b) => b.id === currentId) : -1
            const next = [...doc.blocks]
            const host = at === -1 ? null : next[at]
            const intoEmpty = host && (isTextish(host) || host.type === 'todo') && !host.text.trim()
            if (at === -1) next.push(...created)
            else next.splice(intoEmpty ? at : at + 1, intoEmpty ? 1 : 0, ...created)
            setBlocks(next)
            setRevision((r) => r + 1)
          }}
        />
      )}
    </div>
  )
}
