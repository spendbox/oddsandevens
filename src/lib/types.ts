/**
 * One idea holds this app together: a document is a list of blocks, and every
 * tool the user asked for is a block type. Notes are text blocks, the task
 * manager is todo blocks, the spreadsheet is a table block, code is a code
 * block, a form is a form block. There is no "spreadsheet mode" to switch into
 * and no separate app to open — a table and a paragraph sit in the same
 * document, so a meeting note can carry its own budget and its own actions.
 *
 * Everything downstream follows from that: one editor, one save path, one
 * sync path, one undo stack. Adding a sixth tool means adding a block type,
 * not a second application.
 */


export type BlockType =
  | 'text'
  | 'heading'
  | 'bullet'
  | 'quote'
  | 'todo'
  | 'table'
  | 'code'
  | 'form'
  | 'file'
  | 'divider'

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

/**
 * Cells are a sparse map keyed "A1", "B3" rather than a dense array. A
 * spreadsheet is mostly empty, and a map means adding a row is a number
 * change rather than a thousand allocations.
 */
export interface TableBlock {
  id: string
  type: 'table'
  rows: number
  cols: number
  cells: Record<string, string>
  /** Column widths in px, keyed by column letter. Absent means the default. */
  widths?: Record<string, number>
}

export interface CodeBlock {
  id: string
  type: 'code'
  code: string
  lang: string
}

export type FormFieldType = 'short' | 'long' | 'choice' | 'checkbox' | 'number' | 'email' | 'date'

export interface FormField {
  id: string
  type: FormFieldType
  label: string
  required: boolean
  /** Options for 'choice'. Ignored by every other field type. */
  options?: string[]
}

export interface FormBlock {
  id: string
  type: 'form'
  title: string
  fields: FormField[]
  /**
   * Filled-in answers, newest last. Kept on the block so a form works with no
   * account and no server — the same rule as every other block.
   */
  responses: Array<{ id: string; at: number; values: Record<string, string> }>
}

/**
 * An attached file.
 *
 * The bytes are NOT stored on the block. They live in their own IndexedDB
 * store under `ref`, and only the description travels in the document. A
 * document is sent to the server as JSON on every sync; a 10MB attachment
 * base64'd into that JSON would be a 13MB row rewritten on every keystroke of
 * every other block in the page.
 *
 * The honest consequence, which is stated on screen: attachments stay on the
 * device that added them. Syncing them needs file storage on the server, which
 * is a separate piece of work.
 */
export interface FileBlock {
  id: string
  type: 'file'
  /** The name it was uploaded with, and the name it downloads as. */
  name: string
  mime: string
  size: number
  /** Key into the attachments store. */
  ref: string
}

export interface DividerBlock {
  id: string
  type: 'divider'
}

export type Block =
  | TextishBlock
  | TodoBlock
  | TableBlock
  | CodeBlock
  | FormBlock
  | FileBlock
  | DividerBlock

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

/** The plain text of a block, for search and for the document list preview. */
export function blockText(block: Block): string {
  if (isTextish(block)) return block.text
  if (block.type === 'todo') return block.text
  if (block.type === 'code') return block.code
  if (block.type === 'form') return [block.title, ...block.fields.map((f) => f.label)].join(' ')
  if (block.type === 'table') return Object.values(block.cells).join(' ')
  if (block.type === 'file') return block.name
  return ''
}
