'use client'

import { useRef, useState } from 'react'
import { Markdown } from '@/components/markdown'
import { ErrorNote } from '@/components/ui'
import type { AssistantSpec } from '@/lib/engines'

type Turn = { role: 'user' | 'assistant'; content: string }

/**
 * The creator's assistant, streamed so words appear rather than a spinner.
 *
 * What a visitor types is only ever sent as a user message — the creator's
 * instructions stay in the system prompt, on the server, where a conversation
 * cannot talk its way into replacing them.
 */
export function AssistantRunner({ spec, toolId }: { spec: AssistantSpec; toolId: string }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  async function send(text: string) {
    const question = text.trim()
    if (!question || streaming) return

    setError(null)
    setDraft('')
    const history: Turn[] = [...turns, { role: 'user', content: question }]
    setTurns([...history, { role: 'assistant', content: '' }])
    setStreaming(true)

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toolId, messages: history }),
      })

      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '')
        throw new Error(detail || 'The assistant could not answer just now.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let answer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        answer += decoder.decode(value, { stream: true })
        setTurns([...history, { role: 'assistant', content: answer }])
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }

      if (!answer.trim()) throw new Error('The assistant returned nothing. Try asking again.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.')
      setTurns(history)
    } finally {
      setStreaming(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {turns.length === 0 ? (
          <div className="rounded-[12px] bg-mist px-4 py-3.5">
            <p className="text-[14px] leading-relaxed text-ink-soft">{spec.greeting}</p>
          </div>
        ) : null}

        {turns.map((turn, index) =>
          turn.role === 'user' ? (
            <div key={index} className="flex justify-end">
              <div className="max-w-[85%] rounded-[14px] bg-accent px-3.5 py-2.5 text-[14px] leading-relaxed text-white">
                {turn.content}
              </div>
            </div>
          ) : (
            <div key={index} className="max-w-[95%]">
              {turn.content ? (
                <Markdown text={turn.content} />
              ) : (
                <p className="text-[13px] text-ink-faint">Thinking…</p>
              )}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {turns.length === 0 && spec.starters.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {spec.starters.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => send(starter)}
              className="rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-soft transition-colors hover:bg-mist hover:text-ink"
            >
              {starter}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void send(draft)
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send(draft)
            }
          }}
          rows={1}
          placeholder="Ask a question…"
          aria-label="Your question"
          className="field max-h-40 min-h-[44px] flex-1 resize-none py-2.5"
        />
        <button type="submit" disabled={streaming || !draft.trim()} className="btn btn-primary py-2.5">
          {streaming ? '…' : 'Ask'}
        </button>
      </form>
    </div>
  )
}
