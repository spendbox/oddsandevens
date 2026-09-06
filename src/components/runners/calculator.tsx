'use client'

import { useMemo, useState } from 'react'
import { evaluateFormula } from '@/lib/expression'
import type { CalculatorSpec } from '@/lib/engines'

/**
 * A calculator, running in the browser.
 *
 * Outputs are worked out in order and each one can use the ones before it, so a
 * complicated sum shows its working instead of arriving as a single unexplained
 * number. The formulas are parsed, never evaluated — see lib/expression.
 */
export function CalculatorRunner({ spec }: { spec: CalculatorSpec }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(spec.inputs.map((input) => [input.key, String(input.default_value ?? '')])),
  )

  const results = useMemo(() => {
    const scope: Record<string, number> = {}
    for (const input of spec.inputs) {
      const raw = values[input.key]
      const parsed = Number(raw)
      if (raw !== '' && raw !== undefined && !Number.isNaN(parsed)) scope[input.key] = parsed
    }

    const missing = spec.inputs.filter((input) => scope[input.key] === undefined)

    const computed = spec.outputs.map((output) => {
      let value: number | null = null
      if (missing.length === 0) {
        try {
          value = evaluateFormula(output.formula, scope)
        } catch {
          value = null
        }
      }
      if (value !== null) scope[output.key] = value
      return { output, value }
    })

    return { computed, missing }
  }, [spec, values])

  const format = (value: number) =>
    Math.abs(value) >= 1000
      ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : String(Math.round(value * 100) / 100)

  const primary = results.computed.find((row) => row.output.is_primary) ?? results.computed[0]
  const rest = results.computed.filter((row) => row !== primary)

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {spec.inputs.map((input) => (
          <div key={input.key}>
            <label htmlFor={`calc-${input.key}`} className="label">
              {input.label}
            </label>

            {input.kind === 'choice' && input.options.length > 0 ? (
              <select
                id={`calc-${input.key}`}
                value={values[input.key] ?? ''}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [input.key]: event.target.value }))
                }
                className="field"
              >
                <option value="">Choose…</option>
                {input.options.map((option) => (
                  <option key={option.label} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  id={`calc-${input.key}`}
                  type="number"
                  inputMode="decimal"
                  value={values[input.key] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [input.key]: event.target.value }))
                  }
                  className="field"
                />
                {input.unit ? (
                  <span className="shrink-0 text-[13px] text-ink-muted">{input.unit}</span>
                ) : null}
              </div>
            )}

            {input.help ? <p className="mt-1.5 text-[12px] text-ink-faint">{input.help}</p> : null}
          </div>
        ))}
      </div>

      <div className="rounded-[12px] bg-accent-soft px-4 py-4">
        {results.missing.length > 0 ? (
          <p className="text-[13px] text-ink-muted">
            Fill in {results.missing.length === 1 ? '' : 'the rest of '}
            {results.missing.map((input) => input.label.toLowerCase()).join(', ')} to see the result.
          </p>
        ) : primary ? (
          <>
            <p className="text-[11px] font-medium tracking-wide text-accent uppercase">
              {primary.output.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-accent tabular-nums">
              {primary.value === null ? '—' : `${primary.output.unit}${primary.output.unit ? ' ' : ''}${format(primary.value)}`}
            </p>
            {primary.output.help ? (
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">{primary.output.help}</p>
            ) : null}
          </>
        ) : null}
      </div>

      {rest.length > 0 && results.missing.length === 0 ? (
        <dl className="card divide-y divide-line">
          {rest.map(({ output, value }) => (
            <div key={output.key} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="min-w-0">
                <span className="text-[13px] text-ink-soft">{output.label}</span>
                {output.help ? (
                  <span className="mt-0.5 block text-[11px] text-ink-faint">{output.help}</span>
                ) : null}
              </dt>
              <dd className="shrink-0 text-[13px] font-medium text-ink tabular-nums">
                {value === null ? '—' : `${output.unit}${output.unit ? ' ' : ''}${format(value)}`}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {spec.note ? (
        <p className="text-[12px] leading-relaxed text-ink-faint">{spec.note}</p>
      ) : null}
    </div>
  )
}
