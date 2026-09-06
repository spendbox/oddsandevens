'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ErrorNote } from '@/components/ui'
import type { DirectorySpec } from '@/lib/engines'
import type { ToolRecord } from '@/lib/types'
import { addRecord, removeRecord } from './actions'

/** For a directory, the listings are the product. This is where they go in. */
export function RecordsEditor({
  toolId,
  spec,
  records,
}: {
  toolId: string
  spec: DirectorySpec | null
  records: ToolRecord[]
}) {
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!spec) {
    return <p className="text-[13px] text-ink-muted">Finish the columns first.</p>
  }

  const titleColumn = spec.columns.find((column) => column.is_title) ?? spec.columns[0]

  return (
    <div className="space-y-5">
      <form
        ref={form}
        action={(formData) => {
          startTransition(async () => {
            setError(null)
            const result = await addRecord(toolId, formData)
            if (result.error) setError(result.error)
            else {
              form.current?.reset()
              router.refresh()
            }
          })
        }}
        className="space-y-3"
      >
        {spec.columns.map((column) => (
          <div key={column.key}>
            <label htmlFor={`rec-${column.key}`} className="label">
              {column.label}
            </label>
            {column.kind === 'long_text' ? (
              <textarea id={`rec-${column.key}`} name={column.key} rows={2} className="field resize-none" />
            ) : (
              <input
                id={`rec-${column.key}`}
                name={column.key}
                type={column.kind === 'number' ? 'number' : column.kind === 'link' ? 'url' : 'text'}
                className="field"
              />
            )}
          </div>
        ))}

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? 'Adding…' : `Add ${spec.item_noun}`}
        </button>
      </form>

      {records.length > 0 ? (
        <ul className="divide-y divide-line border-t border-line">
          {records.map((record) => (
            <li key={record.id} className="flex items-start justify-between gap-3 py-2.5">
              <span className="min-w-0 text-[13px] text-ink-soft">
                {String(record.data[titleColumn?.key ?? ''] ?? 'Untitled')}
              </span>
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await removeRecord(toolId, record.id)
                    router.refresh()
                  })
                }
                aria-label="Remove this listing"
                className="shrink-0 px-1 text-ink-faint hover:text-rose"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-ink-faint">
          No listings yet. A directory with nothing in it is not worth sharing.
        </p>
      )}
    </div>
  )
}
