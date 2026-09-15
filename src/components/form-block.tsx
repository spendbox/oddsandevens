'use client'

import { ChevronDown, GripVertical, Plus, Send, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { newId } from '@/lib/id'
import type { FormBlock as FormBlockData, FormField, FormFieldType } from '@/lib/types'

/**
 * The form builder.
 *
 * It has two faces of the same block: Build, where you shape the questions,
 * and Fill, where you answer them exactly as someone else would. They are one
 * block rather than a builder that exports to a separate form, because the
 * fastest way to find out that a question is confusing is to answer it
 * yourself one tap after writing it.
 *
 * Answers are stored on the block, so a form works with no account and no
 * server — the same rule as every other block type here.
 */
const FIELD_TYPES: Array<{ value: FormFieldType; label: string }> = [
  { value: 'short', label: 'Short text' },
  { value: 'long', label: 'Paragraph' },
  { value: 'choice', label: 'Choice' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'date', label: 'Date' },
]

export default function FormBlock({
  block,
  onChange,
  readOnly,
}: {
  block: FormBlockData
  onChange: (next: FormBlockData) => void
  readOnly?: boolean
}) {
  const [mode, setMode] = useState<'build' | 'fill'>('build')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [justSent, setJustSent] = useState(false)
  const [showResponses, setShowResponses] = useState(false)

  const setField = (id: string, patch: Partial<FormField>) =>
    onChange({
      ...block,
      fields: block.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })

  const addField = () =>
    onChange({
      ...block,
      fields: [
        ...block.fields,
        { id: newId(), type: 'short', label: '', required: false },
      ],
    })

  const removeField = (id: string) =>
    onChange({ ...block, fields: block.fields.filter((f) => f.id !== id) })

  const move = (index: number, by: number) => {
    const next = [...block.fields]
    const target = index + by
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange({ ...block, fields: next })
  }

  const submit = () => {
    // Required fields are checked here rather than left to the browser,
    // because these are not real <input required> in a real <form> — a form
    // inside a document cannot submit the page.
    const missing: Record<string, boolean> = {}
    for (const field of block.fields) {
      if (field.required && !(answers[field.id] ?? '').trim()) missing[field.id] = true
    }
    setErrors(missing)
    if (Object.keys(missing).length) return

    onChange({
      ...block,
      responses: [...block.responses, { id: newId(), at: Date.now(), values: answers }],
    })
    setAnswers({})
    setJustSent(true)
    setTimeout(() => setJustSent(false), 2000)
  }

  return (
    <div className="my-2 rounded-lg border border-[var(--color-line)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2">
        <input
          value={block.title}
          readOnly={readOnly}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
          placeholder="Untitled form"
          aria-label="Form title"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-[var(--color-faint)]"
        />
        {!readOnly && (
          <div className="flex shrink-0 rounded-md bg-[var(--color-hover)] p-0.5 text-[11px]">
            {(['build', 'fill'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`rounded px-2 py-0.5 capitalize transition-colors ${
                  mode === m
                    ? 'bg-[var(--color-paper)] text-[var(--color-ink)] shadow-sm'
                    : 'text-[var(--color-muted)]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3">
        {mode === 'build' && !readOnly ? (
          <div className="space-y-2">
            {block.fields.map((field, index) => (
              <div
                key={field.id}
                className="group/field flex items-start gap-1.5 rounded-md border border-transparent p-1 hover:border-[var(--color-line)]"
              >
                <div className="flex flex-col pt-1.5 opacity-0 transition-opacity group-hover/field:opacity-100 group-focus-within/field:opacity-100">
                  <button
                    type="button"
                    aria-label="Move up"
                    onClick={() => move(index, -1)}
                    className="text-[var(--color-faint)] hover:text-[var(--color-ink)]"
                  >
                    <GripVertical size={13} />
                  </button>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <input
                    value={field.label}
                    onChange={(e) => setField(field.id, { label: e.target.value })}
                    placeholder={`Question ${index + 1}`}
                    aria-label={`Question ${index + 1}`}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-faint)]"
                  />
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-muted)]">
                    <select
                      value={field.type}
                      aria-label="Field type"
                      onChange={(e) =>
                        setField(field.id, { type: e.target.value as FormFieldType })
                      }
                      className="cursor-pointer rounded bg-[var(--color-hover)] px-1.5 py-0.5 outline-none"
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <label className="inline-flex cursor-pointer items-center gap-1">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => setField(field.id, { required: e.target.checked })}
                        className="accent-[var(--color-accent)]"
                      />
                      Required
                    </label>
                    {field.type === 'choice' && (
                      <input
                        value={(field.options ?? []).join(', ')}
                        onChange={(e) =>
                          setField(field.id, {
                            options: e.target.value
                              .split(',')
                              .map((o) => o.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="Options, comma separated"
                        aria-label="Choice options"
                        className="min-w-0 flex-1 rounded bg-[var(--color-hover)] px-1.5 py-0.5 outline-none placeholder:text-[var(--color-faint)]"
                      />
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Remove question"
                  onClick={() => removeField(field.id)}
                  className="p-1 text-[var(--color-faint)] opacity-0 transition-opacity group-hover/field:opacity-100 hover:text-[var(--color-danger)] focus:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addField}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
            >
              <Plus size={13} /> Add question
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {block.fields.length === 0 && (
              <p className="text-xs text-[var(--color-faint)]">
                No questions yet. Switch to Build to add some.
              </p>
            )}
            {block.fields.map((field) => (
              <FilledField
                key={field.id}
                field={field}
                value={answers[field.id] ?? ''}
                invalid={!!errors[field.id]}
                onChange={(value) => setAnswers((a) => ({ ...a, [field.id]: value }))}
              />
            ))}
            {block.fields.length > 0 && (
              <button
                type="button"
                onClick={submit}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                <Send size={12} />
                {justSent ? 'Saved' : 'Submit'}
              </button>
            )}
          </div>
        )}

        {block.responses.length > 0 && (
          <div className="mt-3 border-t border-[var(--color-line)] pt-2">
            <button
              type="button"
              onClick={() => setShowResponses((s) => !s)}
              aria-expanded={showResponses}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              <ChevronDown
                size={12}
                className={`transition-transform ${showResponses ? '' : '-rotate-90'}`}
              />
              {block.responses.length}{' '}
              {block.responses.length === 1 ? 'response' : 'responses'}
            </button>
            {showResponses && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="text-[var(--color-faint)]">
                    <tr>
                      <th className="py-1 pr-3 font-normal">When</th>
                      {block.fields.map((f) => (
                        <th key={f.id} className="py-1 pr-3 font-normal">
                          {f.label || 'Untitled'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.responses.map((response) => (
                      <tr key={response.id} className="border-t border-[var(--color-line)]">
                        <td className="py-1 pr-3 whitespace-nowrap text-[var(--color-muted)]">
                          {new Date(response.at).toLocaleString()}
                        </td>
                        {block.fields.map((f) => (
                          <td key={f.id} className="py-1 pr-3">
                            {response.values[f.id] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function FilledField({
  field,
  value,
  invalid,
  onChange,
}: {
  field: FormField
  value: string
  invalid: boolean
  onChange: (value: string) => void
}) {
  const base = `w-full rounded-md border px-2 py-1.5 text-sm outline-none bg-transparent focus:border-[var(--color-accent)] ${
    invalid ? 'border-[var(--color-danger)]' : 'border-[var(--color-line)]'
  }`
  const label = field.label || 'Untitled question'

  return (
    <div>
      <label className="mb-1 block text-xs font-medium">
        {label}
        {field.required && <span className="ml-0.5 text-[var(--color-danger)]">*</span>}
      </label>
      {field.type === 'long' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          aria-label={label}
          className={`${base} resize-y`}
        />
      ) : field.type === 'choice' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className={`${base} cursor-pointer`}
        >
          <option value="">Choose…</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.type === 'checkbox' ? (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value === 'yes'}
            onChange={(e) => onChange(e.target.checked ? 'yes' : '')}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          <span className="text-[var(--color-muted)]">Yes</span>
        </label>
      ) : (
        <input
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className={base}
        />
      )}
    </div>
  )
}
