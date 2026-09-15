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
}

export interface TodoBlock {
  id: string
  type: 'todo'
  text: string
  /** See TextishBlock.html. */
  html?: string
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
  | DividerBlock

export interface Doc {
  id: string
  title: string
  blocks: Block[]
  createdAt: number
  updatedAt: number
  /** Set when the user deletes it; the row stays so sync can carry the delete. */
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
  return ''
}
