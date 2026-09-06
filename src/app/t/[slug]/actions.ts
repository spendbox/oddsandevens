'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { polishDocument } from '@/lib/claude'
import { supabaseServer } from '@/lib/supabase/server'

/** Only a published tool the caller can actually reach may be run. */
async function reachableTool(toolId: string) {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('tools')
    .select('id, slug, engine, status, price_kobo, owner_id, spec')
    .eq('id', toolId)
    .maybeSingle()

  if (!data) return null

  const { data: allowed } = await supabase.rpc('has_access', { p_tool: toolId })
  if (!allowed) return null

  return data as { id: string; slug: string; engine: string; status: string; spec: unknown }
}

/**
 * Finish a generated document with Claude, and record the run.
 *
 * If the model is unavailable the filled-in template is still returned — the
 * person came here for a document, and the un-polished one is a real document.
 */
export async function polishRun(
  toolId: string,
  title: string,
  filled: string,
  input: Record<string, string>,
): Promise<{ document: string; error: string | null }> {
  const tool = await reachableTool(toolId)
  if (!tool) return { document: filled, error: 'This tool is not available.' }

  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let document = filled
  let error: string | null = null

  try {
    document = await polishDocument(title, filled)
  } catch (caught) {
    error =
      caught instanceof Error
        ? `${caught.message}\n\nHere is the document as you filled it in.`
        : 'The finished version could not be written, so here is the document as filled in.'
  }

  await supabase.from('tool_runs').insert({
    tool_id: toolId,
    user_id: user?.id ?? null,
    input,
    output: { document },
  })

  await supabase.rpc('bump_run_count', { p_tool: toolId })

  return { document, error }
}

/** Record that a tool was used, for anything that runs entirely in the browser. */
export async function recordRun(
  toolId: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
) {
  const tool = await reachableTool(toolId)
  if (!tool) return

  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  await supabase.from('tool_runs').insert({
    tool_id: toolId,
    user_id: user?.id ?? null,
    input,
    output,
  })
  await supabase.rpc('bump_run_count', { p_tool: toolId })
}

export async function addEntry(toolId: string, slug: string, formData: FormData) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/signin?next=/t/${slug}`)

  const tool = await reachableTool(toolId)
  if (!tool) return

  const data: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (key === 'entry_date') continue
    const text = String(value).trim()
    if (text) data[key] = text
  }

  if (Object.keys(data).length === 0) return

  const entryDate = String(formData.get('entry_date') ?? '') || new Date().toISOString().slice(0, 10)

  await supabase.from('tool_entries').insert({
    tool_id: toolId,
    user_id: user.id,
    data,
    entry_date: entryDate,
  })

  revalidatePath(`/t/${slug}`)
}

export async function removeEntry(entryId: string, slug: string) {
  const supabase = await supabaseServer()
  await supabase.from('tool_entries').delete().eq('id', entryId)
  revalidatePath(`/t/${slug}`)
}
