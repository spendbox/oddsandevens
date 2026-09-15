'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cellKey, colName, computeGrid } from '@/lib/formula'
import type { TableBlock as TableBlockData } from '@/lib/types'

/**
 * The spreadsheet.
 *
 * Each cell is a real <input>, not a contenteditable. A grid is the one place
 * where the browser's own caret, selection and mobile keyboard handling are
 * worth more than the styling freedom of contenteditable, and an input gives
 * all three for free.
 *
 * A cell shows its computed value when you are not in it and its raw formula
 * when you are — which is what every spreadsheet does, and the reason a
 * formula is editable at all after you have typed it.
 */
export default function TableBlock({
  block,
  onChange,
  readOnly,
}: {
  block: TableBlockData
  onChange: (next: TableBlockData) => void
  readOnly?: boolean
}) {
  const [editing, setEditing] = useState<{ key: string; draft: string } | null>(null)

  // Recomputed only when the cells change, not on every keystroke elsewhere
  // in the document.
  const computed = useMemo(() => computeGrid(block.cells), [block.cells])

  const setCell = (key: string, value: string) => {
    const cells = { ...block.cells }
    // An emptied cell is deleted rather than stored as "", so the sparse map
    // does not slowly fill up with blanks as people clear things.
    if (value === '') delete cells[key]
    else cells[key] = value
    onChange({ ...block, cells })
  }

  const focusCell = (col: number, row: number) => {
    if (col < 0 || row < 0 || col >= block.cols || row >= block.rows) return
    const el = document.querySelector<HTMLInputElement>(
      `[data-cell="${block.id}:${cellKey(col, row)}"]`,
    )
    el?.focus()
    el?.select()
  }

  const addRow = () => onChange({ ...block, rows: block.rows + 1 })
  const addCol = () => onChange({ ...block, cols: block.cols + 1 })

  const removeRow = () => {
    if (block.rows <= 1) return
    const last = block.rows - 1
    const cells = { ...block.cells }
    for (let c = 0; c < block.cols; c++) delete cells[cellKey(c, last)]
    onChange({ ...block, rows: last, cells })
  }

  const removeCol = () => {
    if (block.cols <= 1) return
    const last = block.cols - 1
    const cells = { ...block.cells }
    for (let r = 0; r < block.rows; r++) delete cells[cellKey(last, r)]
    onChange({ ...block, cols: last, cells })
  }

  return (
    <div className="group/table my-2">
      <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
        <table className="w-full border-collapse text-sm" style={{ minWidth: block.cols * 96 }}>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-9 border-r border-b border-[var(--color-line)] bg-[var(--color-hover)] text-[11px] font-normal text-[var(--color-faint)]"
              >
                <span className="sr-only">Row</span>
              </th>
              {Array.from({ length: block.cols }, (_, c) => (
                <th
                  key={c}
                  scope="col"
                  className="border-r border-b border-[var(--color-line)] bg-[var(--color-hover)] px-2 py-1 text-[11px] font-medium text-[var(--color-muted)] last:border-r-0"
                >
                  {colName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: block.rows }, (_, r) => (
              <tr key={r}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-r border-b border-[var(--color-line)] bg-[var(--color-hover)] text-center text-[11px] font-normal text-[var(--color-faint)]"
                >
                  {r + 1}
                </th>
                {Array.from({ length: block.cols }, (_, c) => {
                  const key = cellKey(c, r)
                  const raw = block.cells[key] ?? ''
                  const result = computed[key]
                  const isEditing = editing?.key === key
                  const shown = isEditing ? editing.draft : (result?.text ?? raw)

                  return (
                    <td
                      key={c}
                      className="border-r border-b border-[var(--color-line)] p-0 last:border-r-0"
                    >
                      <input
                        data-cell={`${block.id}:${key}`}
                        aria-label={`Cell ${key}`}
                        readOnly={readOnly}
                        value={shown}
                        // Numbers right-align and errors go red, so a broken
                        // formula is visible without hunting for it.
                        className={`w-full bg-transparent px-2 py-1.5 tabular-nums outline-none focus:bg-[var(--color-accent-soft)] focus:ring-1 focus:ring-inset focus:ring-[var(--color-accent)] ${
                          result?.error
                            ? 'text-[var(--color-danger)]'
                            : result?.numeric && !isEditing
                              ? 'text-right'
                              : ''
                        }`}
                        onFocus={() => setEditing({ key, draft: raw })}
                        onChange={(e) => setEditing({ key, draft: e.target.value })}
                        onBlur={() => {
                          if (editing?.key === key && editing.draft !== raw) setCell(key, editing.draft)
                          setEditing(null)
                        }}
                        onKeyDown={(e) => {
                          const commit = () => {
                            if (editing?.key === key && editing.draft !== raw) setCell(key, editing.draft)
                            setEditing(null)
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commit()
                            focusCell(c, r + 1)
                          } else if (e.key === 'Tab') {
                            e.preventDefault()
                            commit()
                            // Wrap to the next row's first cell at the edge,
                            // rather than trapping focus in the last column.
                            if (c + 1 < block.cols) focusCell(c + 1, r)
                            else focusCell(0, r + 1)
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            setEditing(null)
                            e.currentTarget.blur()
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault()
                            commit()
                            focusCell(c, r + 1)
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault()
                            commit()
                            focusCell(c, r - 1)
                          }
                        }}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 opacity-0 transition-opacity group-focus-within/table:opacity-100 group-hover/table:opacity-100">
          <GridButton onClick={addRow} icon={<Plus size={12} />} label="Row" />
          <GridButton onClick={addCol} icon={<Plus size={12} />} label="Column" />
          <span className="mx-1 h-3 w-px bg-[var(--color-line)]" />
          <GridButton
            onClick={removeRow}
            icon={<Trash2 size={12} />}
            label="Row"
            disabled={block.rows <= 1}
          />
          <GridButton
            onClick={removeCol}
            icon={<Trash2 size={12} />}
            label="Column"
            disabled={block.cols <= 1}
          />
          <span className="ml-auto text-[11px] text-[var(--color-faint)]">
            Try <code className="font-mono">=SUM(A1:A5)</code>
          </span>
        </div>
      )}
    </div>
  )
}

function GridButton({
  onClick,
  icon,
  label,
  disabled,
}: {
  onClick: () => void
  icon: React.ReactNode
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  )
}
