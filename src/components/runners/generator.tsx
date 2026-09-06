'use client'

import { useState } from 'react'
import { Markdown, fillTemplate } from '@/components/markdown'
import { ErrorNote } from '@/components/ui'
import type { GeneratorSpec } from '@/lib/engines'
import { polishRun } from '@/app/t/[slug]/actions'

/**
 * A form that produces a document.
 *
 * The template is filled locally, so something usable exists immediately. When
 * the tool was built to be polished, Claude then writes the prose around those
 * answers — leaving every figure, name and date exactly as entered.
 */
export function GeneratorRunner({
  spec,
  toolId,
  canRun,
}: {
  spec: GeneratorSpec
  toolId: string
  canRun: boolean
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [document, setDocument] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const missing = spec.fields.filter((field) => field.required && !values[field.key]?.trim())
  const title = fillTemplate(spec.document_title, values) || 'Document'

  async function produce() {
    setError(null)
    const filled = fillTemplate(spec.template, values)

    if (!spec.polish_with_ai) {
      setDocument(filled)
      return
    }

    setBusy(true)
    try {
      const result = await polishRun(toolId, title, filled, values)
      setDocument(result.document)
      if (result.error) setError(result.error)
    } catch {
      setDocument(filled)
      setError('The finished version could not be written, so here is the document as filled in.')
    } finally {
      setBusy(false)
    }
  }

  if (document !== null) {
    return (
      <div className="space-y-4">
        <div className="card p-5 sm:p-7">
          <Markdown text={document} />
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <div className="no-print flex flex-wrap gap-2">
          <button type="button" onClick={() => window.print()} className="btn btn-primary">
            Print or save as PDF
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(document)
            }}
            className="btn btn-quiet"
          >
            Copy text
          </button>
          <button type="button" onClick={() => setDocument(null)} className="btn btn-ghost">
            Change the answers
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {spec.fields.map((field) => (
        <div key={field.key}>
          <label htmlFor={`gen-${field.key}`} className="label">
            {field.label}
            {field.required ? <span className="ml-1 text-ink-faint">*</span> : null}
          </label>

          {field.kind === 'long_text' ? (
            <textarea
              id={`gen-${field.key}`}
              rows={3}
              value={values[field.key] ?? ''}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
              className="field resize-none"
            />
          ) : field.kind === 'choice' && field.options.length > 0 ? (
            <select
              id={`gen-${field.key}`}
              value={values[field.key] ?? ''}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
              className="field"
            >
              <option value="">Choose…</option>
              {field.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`gen-${field.key}`}
              type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'}
              value={values[field.key] ?? ''}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
              className="field"
            />
          )}

          {field.help ? <p className="mt-1.5 text-[12px] text-ink-faint">{field.help}</p> : null}
        </div>
      ))}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <button
        type="button"
        onClick={produce}
        disabled={busy || missing.length > 0 || !canRun}
        className="btn btn-primary w-full py-2.5"
      >
        {busy ? 'Writing it…' : missing.length > 0 ? `Fill in ${missing[0].label}` : 'Create the document'}
      </button>
    </div>
  )
}
