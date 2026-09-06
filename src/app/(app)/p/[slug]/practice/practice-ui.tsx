'use client'

import { useRef, useState, useTransition } from 'react'
import { Avatar } from '@/components/avatar'
import { Chip } from '@/components/ui'
import { checkFormula, evaluateFormula } from '@/lib/expression'
import type { CalculatorConfig, ChecklistConfig, Profile, Stage } from '@/lib/types'
import { createQuiz, createTool, recordToolUse, submitQuiz } from '../actions'

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

type ToolView = {
  id: string
  kind: 'checklist' | 'calculator'
  title: string
  description: string
  useCount: number
  config: ChecklistConfig & CalculatorConfig
  authorName: string
}

/**
 * Running somebody else's tool.
 *
 * A checklist is kept in this browser only — it is your copy of their list, and
 * nobody else sees what you ticked. A calculator evaluates the author's formula
 * through a parser that understands arithmetic and nothing else.
 */
export function ToolRunner({ slug, tool }: { slug: string; tool: ToolView }) {
  const [, startTransition] = useTransition()
  const [used, setUsed] = useState(false)
  const [ticked, setTicked] = useState<Set<number>>(new Set())
  const [values, setValues] = useState<Record<string, string>>({})

  const markUsed = () => {
    if (used) return
    setUsed(true)
    startTransition(() => {
      void recordToolUse(slug, tool.id)
    })
  }

  const items = tool.config.items ?? []
  const inputs = tool.config.inputs ?? []

  const numbers = Object.fromEntries(
    inputs.map((input) => [input.key, Number(values[input.key])]),
  ) as Record<string, number>

  const everyValueGiven = inputs.every(
    (input) => values[input.key] !== undefined && values[input.key] !== '' && !Number.isNaN(numbers[input.key]),
  )

  let result: number | null = null
  try {
    result = everyValueGiven ? evaluateFormula(tool.config.formula ?? '', numbers) : null
  } catch {
    result = null
  }

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Chip tone={tool.kind === 'calculator' ? 'sky' : 'lift'}>
              {tool.kind === 'calculator' ? '🧮 Calculator' : '☑️ Checklist'}
            </Chip>
          </div>
          <h3 className="mt-2 text-[15px] leading-snug font-semibold tracking-[-0.01em] text-ink">
            {tool.title}
          </h3>
          {tool.description ? (
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{tool.description}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-[11px] text-ink-faint tabular-nums">
          {tool.useCount} used
        </span>
      </div>

      {tool.kind === 'checklist' ? (
        <ul className="mt-4 space-y-1.5">
          {items.map((item, index) => {
            const on = ticked.has(index)
            return (
              <li key={index}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-[9px] px-2 py-1.5 transition-colors hover:bg-mist">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      markUsed()
                      setTicked((current) => {
                        const next = new Set(current)
                        if (next.has(index)) next.delete(index)
                        else next.add(index)
                        return next
                      })
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#5b53e8]"
                  />
                  <span
                    className={`text-[13px] leading-relaxed ${
                      on ? 'text-ink-faint line-through' : 'text-ink-soft'
                    }`}
                  >
                    {item}
                  </span>
                </label>
              </li>
            )
          })}
          <li className="pt-1 text-[11px] text-ink-faint">
            {ticked.size} of {items.length} done · only you can see this
          </li>
        </ul>
      ) : (
        <div className="mt-4">
          <div className="space-y-2.5">
            {inputs.map((input) => (
              <div key={input.key} className="flex items-center gap-3">
                <label
                  htmlFor={`${tool.id}-${input.key}`}
                  className="flex-1 text-[13px] text-ink-soft"
                >
                  {input.label}
                </label>
                <input
                  id={`${tool.id}-${input.key}`}
                  type="number"
                  inputMode="decimal"
                  value={values[input.key] ?? ''}
                  onChange={(event) => {
                    markUsed()
                    setValues((current) => ({ ...current, [input.key]: event.target.value }))
                  }}
                  className="field w-32 py-1.5 text-right text-[13px]"
                />
              </div>
            ))}
          </div>

          <div className="mt-3.5 rounded-[10px] bg-accent-soft px-3.5 py-3">
            {result !== null ? (
              <p className="text-[15px] font-semibold text-accent tabular-nums">
                {Math.round(result * 100) / 100}
                {tool.config.unit ? (
                  <span className="ml-1.5 text-[13px] font-normal">{tool.config.unit}</span>
                ) : null}
              </p>
            ) : (
              <p className="text-[13px] text-ink-muted">Fill in the numbers above to see a result.</p>
            )}
            <p className="mt-1 font-mono text-[11px] text-ink-faint">{tool.config.formula}</p>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-ink-faint">Built by {tool.authorName}</p>
    </div>
  )
}

export function ToolComposer({
  slug,
  pursuitId,
  stages,
}: {
  slug: string
  pursuitId: string
  stages: Stage[]
}) {
  const [kind, setKind] = useState<'checklist' | 'calculator' | null>(null)
  const [items, setItems] = useState(['', '', ''])
  const [inputs, setInputs] = useState([
    { key: 'savings', label: 'Savings' },
    { key: 'burn', label: 'Monthly spend' },
  ])
  const [formula, setFormula] = useState('savings / burn')
  const form = useRef<HTMLFormElement>(null)

  const formulaProblem = kind === 'calculator' ? checkFormula(formula, inputs.map((i) => i.key)) : null

  if (!kind) {
    return (
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-ink-muted">
          Build something the next person can use.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setKind('checklist')} className="btn btn-quiet">
            ☑️ Checklist
          </button>
          <button type="button" onClick={() => setKind('calculator')} className="btn btn-primary">
            🧮 Calculator
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      ref={form}
      action={async (formData) => {
        await createTool(formData)
        form.current?.reset()
        setKind(null)
      }}
      className="card p-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pursuit_id" value={pursuitId} />
      <input type="hidden" name="kind" value={kind} />

      <h3 className="text-sm font-semibold text-ink">
        {kind === 'checklist' ? 'A checklist' : 'A calculator'}
      </h3>

      <input
        name="title"
        required
        className="field mt-3"
        placeholder={kind === 'checklist' ? 'Before you launch' : 'How long your runway lasts'}
      />
      <textarea
        name="description"
        rows={2}
        className="field mt-2.5 resize-none"
        placeholder="When someone should reach for this."
      />

      {stages.length > 0 ? (
        <select name="stage_id" className="field mt-2.5" defaultValue="">
          <option value="">Useful at any stage</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              Best for: {stage.name}
            </option>
          ))}
        </select>
      ) : null}

      {kind === 'checklist' ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-ink-soft">What has to be true?</p>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-[11px] text-ink-faint">☐</span>
                <input
                  name="item"
                  value={item}
                  onChange={(event) =>
                    setItems((current) =>
                      current.map((value, i) => (i === index ? event.target.value : value)),
                    )
                  }
                  className="field"
                  placeholder="Ten customer interviews done"
                />
                {items.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove item ${index + 1}`}
                    className="shrink-0 px-1 text-ink-faint hover:text-rose"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {items.length < 20 ? (
            <button
              type="button"
              onClick={() => setItems((current) => [...current, ''])}
              className="mt-2.5 text-[12px] font-medium text-accent hover:text-accent-hover"
            >
              + Add another
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-ink-soft">What does it need to know?</p>
          <div className="space-y-2">
            {inputs.map((input, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  name="input_label"
                  value={input.label}
                  onChange={(event) =>
                    setInputs((current) =>
                      current.map((value, i) =>
                        i === index ? { ...value, label: event.target.value } : value,
                      ),
                    )
                  }
                  className="field"
                  placeholder="Savings"
                />
                <input
                  name="input_key"
                  value={input.key}
                  onChange={(event) =>
                    setInputs((current) =>
                      current.map((value, i) =>
                        i === index
                          ? { ...value, key: event.target.value.replace(/[^a-zA-Z0-9_]/g, '') }
                          : value,
                      ),
                    )
                  }
                  className="field w-36 font-mono text-[12px]"
                  placeholder="savings"
                />
                {inputs.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setInputs((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove input ${index + 1}`}
                    className="shrink-0 px-1 text-ink-faint hover:text-rose"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {inputs.length < 8 ? (
            <button
              type="button"
              onClick={() => setInputs((current) => [...current, { key: '', label: '' }])}
              className="mt-2.5 text-[12px] font-medium text-accent hover:text-accent-hover"
            >
              + Add an input
            </button>
          ) : null}

          <label htmlFor="formula" className="mt-4 mb-1.5 block text-xs font-medium text-ink-soft">
            The sum, using the short names on the right
          </label>
          <input
            id="formula"
            name="formula"
            value={formula}
            onChange={(event) => setFormula(event.target.value)}
            className="field font-mono text-[13px]"
            placeholder="savings / burn"
          />
          <input name="unit" className="field mt-2.5" placeholder="Unit, e.g. months (optional)" />

          {formulaProblem ? (
            <p className="mt-2 text-[12px] text-rose">{formulaProblem}</p>
          ) : (
            <p className="mt-2 text-[12px] text-lift">That formula works.</p>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={() => setKind(null)} className="btn btn-quiet">
          Cancel
        </button>
        <button type="submit" disabled={Boolean(formulaProblem)} className="btn btn-primary">
          Publish tool
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

type QuizView = {
  id: string
  title: string
  description: string
  attemptCount: number
  questions: {
    id: string
    prompt: string
    options: string[]
    correctIndex: number
    explanation: string
  }[]
}

export function QuizCard({
  slug,
  quiz,
  author,
  previous,
  canTake,
}: {
  slug: string
  quiz: QuizView
  author?: Profile
  previous: { score: number; total: number } | null
  canTake: boolean
}) {
  const [open, setOpen] = useState(false)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [checked, setChecked] = useState(false)
  const form = useRef<HTMLFormElement>(null)

  const answered = quiz.questions.filter((question) => answers[question.id] !== undefined).length
  const score = quiz.questions.filter(
    (question) => answers[question.id] === question.correctIndex,
  ).length

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] leading-snug font-semibold tracking-[-0.01em] text-ink">
            {quiz.title}
          </h3>
          {quiz.description ? (
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{quiz.description}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {author ? (
              <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                <Avatar profile={author} size="xs" /> {author.full_name}
              </span>
            ) : null}
            <span className="text-[11px] text-ink-faint">
              {quiz.questions.length} questions · {quiz.attemptCount} taken
            </span>
          </div>
        </div>
        {previous ? (
          <Chip tone="lift">
            You scored {previous.score}/{previous.total}
          </Chip>
        ) : null}
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!canTake}
          className="btn btn-quiet mt-4"
        >
          {canTake ? (previous ? 'Take it again' : 'Take this quiz') : 'You wrote this one'}
        </button>
      ) : (
        <form
          ref={form}
          action={async (formData) => {
            await submitQuiz(formData)
            setChecked(true)
          }}
          className="mt-4"
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="quiz_id" value={quiz.id} />

          <ol className="space-y-4">
            {quiz.questions.map((question, index) => {
              const chosen = answers[question.id]
              return (
                <li key={question.id}>
                  <p className="text-[13px] font-medium text-ink">
                    {index + 1}. {question.prompt}
                  </p>
                  <input type="hidden" name={`q_${question.id}`} value={chosen ?? -1} />
                  <div className="mt-2 space-y-1.5">
                    {question.options.map((option, optionIndex) => {
                      const isChosen = chosen === optionIndex
                      const isRight = optionIndex === question.correctIndex
                      const tone = !checked
                        ? isChosen
                          ? 'border-accent bg-accent-soft'
                          : 'border-line hover:bg-mist'
                        : isRight
                          ? 'border-[#bbe5c8] bg-lift-soft'
                          : isChosen
                            ? 'border-[#f6c9d3] bg-rose-soft'
                            : 'border-line'
                      return (
                        <label
                          key={optionIndex}
                          className={`flex cursor-pointer items-start gap-2.5 rounded-[10px] border px-3 py-2 transition-colors ${tone}`}
                        >
                          <input
                            type="radio"
                            checked={isChosen}
                            disabled={checked}
                            onChange={() =>
                              setAnswers((current) => ({ ...current, [question.id]: optionIndex }))
                            }
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#5b53e8]"
                          />
                          <span className="text-[13px] leading-relaxed text-ink-soft">{option}</span>
                        </label>
                      )
                    })}
                  </div>
                  {checked && question.explanation ? (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
                      {question.explanation}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ol>

          {checked ? (
            <div className="mt-4 rounded-[10px] bg-mist px-3.5 py-3">
              <p className="text-[13px] font-semibold text-ink">
                {score} out of {quiz.questions.length}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                The person who wrote this earned points for it.
              </p>
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-[12px] text-ink-faint">
                {answered} of {quiz.questions.length} answered
              </span>
              <button
                type="submit"
                disabled={answered < quiz.questions.length}
                className="btn btn-primary"
              >
                Check answers
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}

export function QuizComposer({
  slug,
  pursuitId,
  stages,
}: {
  slug: string
  pursuitId: string
  stages: Stage[]
}) {
  const [open, setOpen] = useState(false)
  const [questions, setQuestions] = useState([{ options: ['', '', ''], answer: 0 }])
  const form = useRef<HTMLFormElement>(null)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card card-hover w-full p-4 text-left text-sm text-ink-faint"
      >
        Write a quiz about something you had to learn the hard way…
      </button>
    )
  }

  return (
    <form
      ref={form}
      action={async (formData) => {
        await createQuiz(formData)
        form.current?.reset()
        setOpen(false)
        setQuestions([{ options: ['', '', ''], answer: 0 }])
      }}
      className="card p-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pursuit_id" value={pursuitId} />

      <h3 className="text-sm font-semibold text-ink">A new quiz</h3>
      <input name="title" required className="field mt-3" placeholder="Do you actually understand validation?" />
      <textarea
        name="description"
        rows={2}
        className="field mt-2.5 resize-none"
        placeholder="Who this is for, and what it checks."
      />

      {stages.length > 0 ? (
        <select name="stage_id" className="field mt-2.5" defaultValue="">
          <option value="">Not tied to a stage</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              About: {stage.name}
            </option>
          ))}
        </select>
      ) : null}

      <div className="mt-5 space-y-5">
        {questions.map((question, index) => (
          <div key={index} className="rounded-[12px] border border-line p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-ink-soft">Question {index + 1}</p>
              {questions.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setQuestions((current) => current.filter((_, i) => i !== index))}
                  className="text-[11px] text-ink-faint hover:text-rose"
                >
                  Remove
                </button>
              ) : null}
            </div>

            <input name="prompt" required className="field mt-2" placeholder="What is the point of a customer interview?" />
            <input type="hidden" name="answer" value={question.answer} />

            <p className="mt-3 mb-1.5 text-[11px] text-ink-faint">
              Tick the right answer
            </p>
            <div className="space-y-1.5">
              {question.options.map((_, optionIndex) => (
                <div key={optionIndex} className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={question.answer === optionIndex}
                    onChange={() =>
                      setQuestions((current) =>
                        current.map((q, i) => (i === index ? { ...q, answer: optionIndex } : q)),
                      )
                    }
                    aria-label={`Answer ${optionIndex + 1} is correct`}
                    className="h-3.5 w-3.5 shrink-0 accent-[#5b53e8]"
                  />
                  <input
                    name={`option_${index}`}
                    className="field"
                    placeholder={`Answer ${optionIndex + 1}`}
                  />
                </div>
              ))}
            </div>

            <input name="explanation" className="field mt-2.5" placeholder="Why (shown after answering, optional)" />
          </div>
        ))}
      </div>

      {questions.length < 10 ? (
        <button
          type="button"
          onClick={() => setQuestions((current) => [...current, { options: ['', '', ''], answer: 0 }])}
          className="mt-3 text-[12px] font-medium text-accent hover:text-accent-hover"
        >
          + Add a question
        </button>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Publish quiz
        </button>
      </div>
    </form>
  )
}
