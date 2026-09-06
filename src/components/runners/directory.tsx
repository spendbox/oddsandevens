'use client'

import { useMemo, useState } from 'react'
import type { DirectorySpec } from '@/lib/engines'
import type { ToolRecord } from '@/lib/types'

export function DirectoryRunner({
  spec,
  records,
}: {
  spec: DirectorySpec
  records: ToolRecord[]
}) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})

  const titleColumn = spec.columns.find((column) => column.is_title) ?? spec.columns[0]
  const filterable = spec.columns.filter((column) => column.filterable)

  const choices = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const column of filterable) {
      const values = new Set<string>()
      for (const record of records) {
        const value = String(record.data[column.key] ?? '').trim()
        if (value) values.add(value)
      }
      map.set(column.key, [...values].sort())
    }
    return map
  }, [filterable, records])

  const shown = records.filter((record) => {
    const haystack = Object.values(record.data).join(' ').toLowerCase()
    if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false
    return Object.entries(filters).every(
      ([key, value]) => !value || String(record.data[key] ?? '') === value,
    )
  })

  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${records.length} ${spec.item_noun}${records.length === 1 ? '' : 's'}…`}
          aria-label="Search"
          className="field"
        />

        {filterable.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {filterable.map((column) => (
              <select
                key={column.key}
                value={filters[column.key] ?? ''}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, [column.key]: event.target.value }))
                }
                aria-label={column.label}
                className="field w-auto py-1.5 text-[13px]"
              >
                <option value="">All {column.label.toLowerCase()}</option>
                {(choices.get(column.key) ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ))}
          </div>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-ink-muted">
          {records.length === 0
            ? `No ${spec.item_noun}s have been added yet.`
            : 'Nothing matches that.'}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((record) => (
            <li key={record.id} className="card p-4">
              <p className="text-[14px] font-semibold text-ink">
                {String(record.data[titleColumn?.key ?? ''] ?? 'Untitled')}
              </p>

              <dl className="mt-2 space-y-1">
                {spec.columns
                  .filter((column) => column.key !== titleColumn?.key)
                  .map((column) => {
                    const value = String(record.data[column.key] ?? '').trim()
                    if (!value) return null
                    return (
                      <div key={column.key} className="flex gap-2 text-[13px]">
                        <dt className="shrink-0 text-ink-faint">{column.label}</dt>
                        <dd className="min-w-0 text-ink-soft">
                          {column.kind === 'link' ? (
                            <a
                              href={value}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="break-all text-accent hover:text-accent-hover"
                            >
                              {value}
                            </a>
                          ) : column.kind === 'tag' ? (
                            <span className="chip bg-mist text-ink-muted">{value}</span>
                          ) : (
                            value
                          )}
                        </dd>
                      </div>
                    )
                  })}
              </dl>
            </li>
          ))}
        </ul>
      )}

      {shown.length > 0 && shown.length !== records.length ? (
        <p className="text-[12px] text-ink-faint">
          Showing {shown.length} of {records.length}.
        </p>
      ) : null}
    </div>
  )
}
