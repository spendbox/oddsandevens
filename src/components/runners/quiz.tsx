'use client'

import { useState } from 'react'
import type { QuizSpec } from '@/lib/engines'

export function QuizRunner({ spec }: { spec: QuizSpec }) {
  // Answers are stored as the option's position, not its score: two options can
  // legitimately be worth the same, and storing the score would light both up.
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)

  const answered = Object.keys(answers).length
  const total = spec.questions.length
  const score = spec.questions.reduce((sum, question, index) => {
    const chosen = answers[index]
    return sum + (chosen === undefined ? 0 : (question.options[chosen]?.score ?? 0))
  }, 0)

  // Bands should cover every total, but a generated spec is still data — fall
  // back to the nearest band rather than showing somebody nothing.
  const band =
    spec.results.find((result) => score >= result.min_score && score <= result.max_score) ??
    [...spec.results].sort(
      (a, b) => Math.abs(score - a.min_score) - Math.abs(score - b.min_score),
    )[0]

  if (submitted && band) {
    return (
      <div className="space-y-5">
        <div className="rounded-[12px] bg-accent-soft px-5 py-5">
          <p className="text-[11px] font-medium tracking-wide text-accent uppercase">Your result</p>
          <h3 className="mt-1.5 text-lg font-semibold tracking-[-0.02em] text-ink">{band.title}</h3>
          <p className="mt-2.5 text-[14px] leading-relaxed whitespace-pre-line text-ink-soft">
            {band.body}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setAnswers({})
            setSubmitted(false)
          }}
          className="btn btn-quiet"
        >
          Take it again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {spec.intro ? (
        <p className="text-[14px] leading-relaxed text-ink-soft">{spec.intro}</p>
      ) : null}

      <ol className="space-y-6">
        {spec.questions.map((question, index) => (
          <li key={index}>
            <p className="text-[14px] font-medium text-ink">
              {index + 1}. {question.prompt}
            </p>
            {question.help ? (
              <p className="mt-1 text-[12px] text-ink-faint">{question.help}</p>
            ) : null}

            <div className="mt-2.5 space-y-1.5">
              {question.options.map((option, optionIndex) => {
                const isSelected = answers[index] === optionIndex
                return (
                  <label
                    key={optionIndex}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-[10px] border px-3.5 py-2.5 transition-colors ${
                      isSelected ? 'border-accent bg-accent-soft' : 'border-line hover:bg-mist'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${index}`}
                      checked={isSelected}
                      onChange={() =>
                        setAnswers((current) => ({ ...current, [index]: optionIndex }))
                      }
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#5b53e8]"
                    />
                    <span className="text-[13px] leading-relaxed text-ink-soft">{option.label}</span>
                  </label>
                )
              })}
            </div>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-ink-faint">
          {answered} of {total} answered
        </span>
        <button
          type="button"
          disabled={answered < total}
          onClick={() => setSubmitted(true)}
          className="btn btn-primary"
        >
          See my result
        </button>
      </div>
    </div>
  )
}
