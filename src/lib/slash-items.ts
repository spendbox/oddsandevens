import type { BlockType } from './types'

/**
 * What the slash menu offers, and how a typed query is ranked against it.
 *
 * This is deliberately plain data with no JSX, so the ranking can be tested
 * directly. The icon is named here and resolved to a component in the menu —
 * the thing worth testing is which item Enter will insert, not which glyph
 * sits next to it.
 */
export type IconName =
  | 'text'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'todo'
  | 'bullet'
  | 'table'
  | 'code'
  | 'form'
  | 'file'
  | 'quote'
  | 'divider'

export interface SlashItem {
  type: BlockType
  level?: 1 | 2 | 3
  label: string
  hint: string
  icon: IconName
  /** Whole words that should also match, so "sheet" finds the spreadsheet. */
  keywords: string
}

export const SLASH_ITEMS: SlashItem[] = [
  { type: 'text', label: 'Text', hint: 'Plain paragraph', icon: 'text', keywords: 'paragraph note body plain write' },
  { type: 'heading', level: 1, label: 'Heading 1', hint: 'Big section title', icon: 'h1', keywords: 'title h1 big' },
  { type: 'heading', level: 2, label: 'Heading 2', hint: 'Section title', icon: 'h2', keywords: 'title h2 subtitle' },
  { type: 'heading', level: 3, label: 'Heading 3', hint: 'Small title', icon: 'h3', keywords: 'title h3 small' },
  { type: 'todo', label: 'Task', hint: 'Checkbox you can tick', icon: 'todo', keywords: 'todo check tick done action reminder' },
  { type: 'bullet', label: 'Bullet', hint: 'Bulleted list item', icon: 'bullet', keywords: 'list point item' },
  { type: 'table', label: 'Spreadsheet', hint: 'Grid with formulas', icon: 'table', keywords: 'table sheet grid excel sum calculate budget numbers formula' },
  { type: 'code', label: 'Code', hint: 'Syntax highlighted', icon: 'code', keywords: 'snippet program script syntax' },
  { type: 'form', label: 'Form', hint: 'Questions and answers', icon: 'form', keywords: 'survey questions input collect responses' },
  { type: 'file', label: 'File', hint: 'Attach or drop a file', icon: 'file', keywords: 'attach attachment upload document image pdf' },
  { type: 'quote', label: 'Quote', hint: 'Indented quotation', icon: 'quote', keywords: 'blockquote cite' },
  { type: 'divider', label: 'Divider', hint: 'Horizontal line', icon: 'divider', keywords: 'line rule separator break' },
]

/**
 * Ranked, not filtered.
 *
 * A plain substring search over the joined keywords put Spreadsheet above Form
 * for the query "form", because "formula" contains "form" — so typing "/form"
 * and pressing Enter inserted a grid. Keywords are therefore matched as whole
 * words by prefix, and any hit on the label outranks any hit on a keyword.
 */
export function rankItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_ITEMS

  const score = (item: SlashItem): number => {
    const label = item.label.toLowerCase()
    if (label === q) return 4
    if (label.startsWith(q)) return 3
    if (label.includes(q)) return 2
    if (item.keywords.split(' ').some((word) => word.startsWith(q))) return 1
    return 0
  }

  return SLASH_ITEMS.map((item) => ({ item, rank: score(item) }))
    .filter((entry) => entry.rank > 0)
    // Sort is stable in every engine this runs on, so equal ranks keep the
    // authored order above and the menu does not reshuffle as you type.
    .sort((a, b) => b.rank - a.rank)
    .map((entry) => entry.item)
}
