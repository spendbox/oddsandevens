import { assistantStream, BuilderError } from '@/lib/claude'
import { parseSpec, type AssistantSpec } from '@/lib/engines'
import { supabaseServer } from '@/lib/supabase/server'

export const maxDuration = 120

type Turn = { role: 'user' | 'assistant'; content: string }

/**
 * Streams an assistant's reply.
 *
 * The creator's instructions are read from the database here, on the server —
 * never sent up from the browser — so what a visitor types cannot replace them.
 */
export async function POST(request: Request) {
  let body: { toolId?: string; messages?: Turn[] }

  try {
    body = await request.json()
  } catch {
    return new Response('That request could not be read.', { status: 400 })
  }

  const toolId = String(body.toolId ?? '')
  const history = Array.isArray(body.messages) ? body.messages : []

  if (!toolId || history.length === 0) {
    return new Response('Nothing to answer.', { status: 400 })
  }

  const supabase = await supabaseServer()
  const { data: tool } = await supabase
    .from('tools')
    .select('id, engine, spec, status')
    .eq('id', toolId)
    .maybeSingle()

  if (!tool || tool.engine !== 'assistant') {
    return new Response('This assistant is not available.', { status: 404 })
  }

  const { data: allowed } = await supabase.rpc('has_access', { p_tool: toolId })
  if (!allowed) {
    return new Response('This assistant has not been paid for.', { status: 402 })
  }

  const spec = parseSpec<AssistantSpec>('assistant', tool.spec)
  if (!spec) return new Response('This assistant is not finished yet.', { status: 409 })

  // Keep the conversation to a sane length and drop anything malformed.
  const turns: Turn[] = history
    .filter(
      (turn): turn is Turn =>
        (turn?.role === 'user' || turn?.role === 'assistant') &&
        typeof turn?.content === 'string' &&
        turn.content.trim().length > 0,
    )
    .slice(-24)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 8000) }))

  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    return new Response('Nothing to answer.', { status: 400 })
  }

  try {
    const stream = assistantStream(spec.instructions, spec.knowledge, turns)

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta' &&
              event.delta.text
            ) {
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
        } catch {
          controller.enqueue(encoder.encode('\n\n(The answer was cut short.)'))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(body, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      },
    })
  } catch (error) {
    const message =
      error instanceof BuilderError ? error.message : 'The assistant could not answer just now.'
    return new Response(message, { status: 503 })
  }
}
