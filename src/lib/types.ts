/**
 * A note is a list of blocks, and every block is a line of writing.
 *
 * There used to be five kinds of tool in here — a spreadsheet, a code editor
 * with a syntax highlighter, a form builder, file attachments — each a block
 * type sitting inside the same note. It was a good idea and it was the wrong
 * app: somebody taking notes in a meeting wants to write, and every one of
 * those was weight in the first download and a control on a bar they had to
 * read past to get to their own words. What is left is what writing is made
 * of: paragraphs, headings, bullets, boxes to tick, quotes and a line across
 * the page.
 *
 * Everything downstream follows from that: one editor, one save path, one
 * sync path, one undo stack.
 */


export type BlockType = 'text' | 'heading' | 'bullet' | 'quote' | 'todo' | 'divider'

/** Blocks that are a single run of editable text. They share one component. */
export interface TextishBlock {
  id: string
  type: 'text' | 'heading' | 'bullet' | 'quote'
  /**
   * The plain text. Always present, and always the source of truth for search,
   * the sidebar preview and export — none of which should have to parse markup.
   */
  text: string
  /**
   * The same run with bold, italic and the rest, when it has any. Absent means
   * unformatted, which is also what every block saved before formatting
   * existed looks like: the fallback to escaped `text` is the whole migration.
   */
  html?: string
  /** Heading size. Only read when type is 'heading'. */
  level?: 1 | 2 | 3
  /**
   * Nesting depth, set by Tab. Absent means zero — the common case, so it is
   * not written into every block in storage.
   */
  indent?: number
  /**
   * A numbered list item, when the block is a bullet.
   *
   * The number itself is never stored. It is counted at render time from the
   * run of items above, which is what makes Enter continue the sequence and
   * deleting an item renumber the rest — both for free, and both impossible
   * to get out of step with the document.
   */
  ordered?: boolean
  /**
   * How the line sits in its measure. Absent means left, which is almost
   * every line ever written, so it is not stored on every block.
   */
  align?: Align
}

/**
 * Paragraph alignment, as a word processor has always had it.
 *
 * Stored on the block rather than applied as inline HTML: alignment is a
 * property of the paragraph, not a run of characters inside it, and keeping
 * it out of `html` means the sanitiser can go on allowing no attributes at
 * all — which is the rule that makes formatting safe to sync.
 */
export type Align = 'left' | 'center' | 'right' | 'justify'

export interface TodoBlock {
  id: string
  type: 'todo'
  text: string
  /** See TextishBlock.html. */
  html?: string
  /** See TextishBlock.indent. */
  indent?: number
  /** See TextishBlock.align. */
  align?: Align
  done: boolean
}

export interface DividerBlock {
  id: string
  type: 'divider'
}

export type Block = TextishBlock | TodoBlock | DividerBlock

export interface Doc {
  id: string
  title: string
  blocks: Block[]
  createdAt: number
  updatedAt: number
  /**
   * The project this document belongs to, if any.
   *
   * A document carries its project rather than a project carrying a list of
   * documents. That way membership has exactly one home: moving a document
   * between projects is one field on one row, and there is no second list that
   * can disagree about where it lives — which is the failure mode that makes
   * two devices show different contents for the same project.
   */
  projectId?: string
  /**
   * When it was starred, or absent when it never was.
   *
   * A timestamp rather than a boolean, so favourites can be listed in the
   * order they were chosen, and so an unstar is an absent field rather than
   * `false` — which is the same shape every other optional field here uses,
   * and what lets a document saved before favourites existed load unchanged.
   */
  favoritedAt?: number
  /**
   * When it was moved to the trash. The row stays so sync carries the delete
   * to other devices, and so it can be restored.
   */
  deletedAt?: number
  /**
   * When it was destroyed for good — by the seven-day sweep or by hand.
   *
   * The row is kept even then, emptied of its title and blocks. A tombstone
   * costs a few dozen bytes; removing the row entirely would let another
   * device that still has its copy push it straight back on the next sync,
   * and the document would rise from the dead.
   */
  purgedAt?: number
}

/**
 * A project is a group of documents, and nothing else.
 *
 * Deliberately not a block type — that rule is about the tools inside a
 * document. This is the axis above: how documents are organised relative to
 * one another. Keeping it thin matters, because the moment a project grows its
 * own content it becomes a second kind of document and the model forks.
 */
export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /** Collapsed in the sidebar. A view preference, synced so it travels. */
  collapsed?: boolean
  /** A tombstone, like a document's, so a delete reaches the other device. */
  deletedAt?: number
}

export function isTextish(block: Block): block is TextishBlock {
  return (
    block.type === 'text' ||
    block.type === 'heading' ||
    block.type === 'bullet' ||
    block.type === 'quote'
  )
}

/** The plain text of a block, for search and for the list preview. */
export function blockText(block: Block): string {
  if (isTextish(block)) return block.text
  if (block.type === 'todo') return block.text
  return ''
}

/**
 * Anything read back from storage, made into blocks this app still has.
 *
 * Notes written before the spreadsheet, the code block, the form and the
 * attachment were taken out still have those blocks in them on the device and
 * on the server. Dropping them silently would be losing somebody's work, and
 * rendering them is exactly the weight that was removed — so each one becomes
 * a paragraph of whatever text it carried, which is the part a note was ever
 * going to be read for.
 *
 * Every read goes through this: the store, sync, an import, a shared copy.
 */
export function readBlocks(blocks: unknown): Block[] {
  if (!Array.isArray(blocks)) return []
  const out: Block[] = []
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue
    const block = raw as Record<string, unknown>
    const id = typeof block.id === 'string' ? block.id : ''
    if (!id) continue
    const type = block.type
    if (
      type === 'text' ||
      type === 'heading' ||
      type === 'bullet' ||
      type === 'quote' ||
      type === 'todo' ||
      type === 'divider'
    ) {
      out.push(raw as Block)
      continue
    }
    const text = legacyText(block)
    if (text) out.push({ id, type: 'text', text })
  }
  return out
}

/** The words inside a block type this app no longer has. */
function legacyText(block: Record<string, unknown>): string {
  if (typeof block.code === 'string') return block.code
  if (typeof block.name === 'string') return block.name
  if (typeof block.title === 'string') return block.title
  if (block.cells && typeof block.cells === 'object') {
    return Object.values(block.cells as Record<string, string>)
      .filter((cell) => typeof cell === 'string' && cell.trim())
      .join('  ')
  }
  return typeof block.text === 'string' ? block.text : ''
}
