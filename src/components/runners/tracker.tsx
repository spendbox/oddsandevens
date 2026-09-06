'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { TrackerSpec } from '@/lib/engines'
import type { ToolEntry } from '@/lib/types'
import { addEntry, removeEntry } from '@/app/t/[slug]/actions'

/**
 * A tracker keeps somebody's own entries, so it needs them signed in — the
 * rows belong to a person, not to a browser tab. What they record is theirs:
 * the row level security policy does not let the tool's own maker read it.
 */
export function TrackerRunner({
  spec,
  toolId,
  slug,
  entries,
  signedIn,
}: {
  spec: TrackerSpec
  toolId: string
  slug: string
  entries: ToolEntry[]
  signedIn: boolean
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  const summaries = spec.summaries.map((summary) => {
    const numbers = entries
      .map((entry) => Number(entry.data[summary.field_key]))
      .filter((value) => !Number.isNaN(value))

    let value: string
    if (summary.kind === 'count') value = String(entries.length)
    else if (numbers.length === 0) value = '—'
    else if (summary.kind === 'sum')
      value = numbers.reduce((a, b) => a + b, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
    else if (summary.kind === 'average')
      value = (numbers.reduce((a, b) => a + b, 0) / numbers.length).toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })
    else value = String(numbers[0])

    const field = spec.fields.find((f) => f.key === summary.field_key)
    return { label: summary.label, value, unit: field?.unit ?? '' }
  })

  if (!signedIn) {
    return (
      <div className="card bg-mist p-5 text-center">
        <p className="text-sm font-semibold text-ink">Sign in to use this tracker</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">
          What you record here is kept to your account — not even the person who made this tool can
          see it.
        </p>
        <Link href={`/signin?next=/t/${slug}`} className="btn btn-primary mt-4">
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {summaries.length > 0 ? (
        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {summaries.map((summary) => (
            <div key={summary.label} className="card px-3.5 py-3">
              <dt className="text-[11px] tracking-wide text-ink-muted uppercase">{summary.label}</dt>
              <dd className="mt-1 text-lg font-semibold text-ink tabular-nums">
                {summary.value}
                {summary.unit && summary.value !== '—' ? (
                  <span className="ml-1 text-[12px] font-normal text-ink-muted">{summary.unit}</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <form
        action={(formData) => {
          startTransition(async () => {
            await addEntry(toolId, slug, formData)
            setValues({})
          })
        }}
        className="card space-y-3.5 p-4"
      >
        <p className="text-sm font-semibold text-ink">Add {spec.entry_noun}</p>

        {spec.fields.map((field) => (
          <div key={field.key}>
            <label htmlFor={`tr-${field.key}`} className="label">
              {field.label}
              {field.unit ? <span className="ml-1 text-ink-faint">({field.unit})</span> : null}
            </label>

            {field.kind === 'choice' && field.options.length > 0 ? (
              <select
                id={`tr-${field.key}`}
                name={field.key}
                value={values[field.key] ?? ''}
                onChange={(e) => setValues((c) => ({ ...c, [field.key]: e.target.value }))}
                className="field"
              >
                <option value="">Choose…</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : field.kind === 'yes_no' ? (
              <select
                id={`tr-${field.key}`}
                name={field.key}
                value={values[field.key] ?? ''}
                onChange={(e) => setValues((c) => ({ ...c, [field.key]: e.target.value }))}
                className="field"
              >
                <option value="">Choose…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : (
              <input
                id={`tr-${field.key}`}
                name={field.key}
                type={field.kind === 'number' ? 'number' : 'text'}
                inputMode={field.kind === 'number' ? 'decimal' : undefined}
                value={values[field.key] ?? ''}
                onChange={(e) => setValues((c) => ({ ...c, [field.key]: e.target.value }))}
                className="field"
              />
            )}
          </div>
        ))}

        <div>
          <label htmlFor="tr-date" className="label">
            Date
          </label>
          <input
            id="tr-date"
            name="entry_date"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="field"
          />
        </div>

        <button type="submit" disabled={pending} className="btn btn-primary w-full">
          {pending ? 'Saving…' : `Add ${spec.entry_noun}`}
        </button>
      </form>

      {entries.length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] font-medium tracking-wide text-ink-muted uppercase">
            Your entries
          </p>
          <ul className="card divide-y divide-line">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-ink">
                    {spec.fields
                      .map((field) => {
                        const value = entry.data[field.key]
                        if (value === undefined || value === '') return null
                        return `${field.label}: ${value}${field.unit ? ` ${field.unit}` : ''}`
                      })
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    {new Date(entry.entry_date).toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                </div>
                <form action={removeEntry.bind(null, entry.id, slug)}>
                  <button
                    type="submit"
                    aria-label="Delete this entry"
                    className="shrink-0 px-1 text-ink-faint hover:text-rose"
                  >
                    ×
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
