'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { buildSpec, BuilderError, planTool, reviseSpec } from '@/lib/claude'
import { isEngineId, parseSpec, type EngineId } from '@/lib/engines'
import { requireProfile } from '@/lib/session'
import { uniqueSlug } from '@/lib/slug'
import { supabaseServer } from '@/lib/supabase/server'

async function ownedTool(id: string) {
  const { userId } = await requireProfile()
  const supabase = await supabaseServer()

  const { data } = await supabase.from('tools').select('*').eq('id', id).maybeSingle()
  if (!data || data.owner_id !== userId) redirect('/tools')

  return { tool: data, supabase, userId }
}

export type BuildResult = { error: string | null }

/**
 * Build the tool from the brief. Two calls: what kind of thing is this, then
 * build that kind of thing against its own schema.
 */
export async function generateTool(id: string): Promise<BuildResult> {
  const { tool, supabase } = await ownedTool(id)

  try {
    const plan = await planTool(tool.brief)
    const spec = await buildSpec(plan.engine, tool.brief, plan)

    // The slug is the link people will share, so name it properly now that the
    // tool has a real title rather than the first few words of the brief.
    const slug = await uniqueSlug(supabase, plan.title)

    const { error } = await supabase
      .from('tools')
      .update({
        engine: plan.engine,
        title: plan.title,
        tagline: plan.tagline,
        emoji: plan.emoji,
        accent: plan.accent,
        slug,
        spec,
      })
      .eq('id', id)

    if (error) return { error: `The tool was built but could not be saved: ${error.message}` }

    revalidatePath(`/build/${id}`)
    return { error: null }
  } catch (error) {
    return {
      error: error instanceof BuilderError ? error.message : 'The tool could not be built.',
    }
  }
}

/** Change the tool by asking, rather than by editing every field. */
export async function askForChange(id: string, instruction: string): Promise<BuildResult> {
  const { tool, supabase } = await ownedTool(id)

  if (!instruction.trim()) return { error: 'Say what you would like changed.' }
  if (!isEngineId(tool.engine)) return { error: 'This tool has no engine set.' }

  try {
    const spec = await reviseSpec(tool.engine, tool.spec, instruction.trim())
    const { error } = await supabase.from('tools').update({ spec }).eq('id', id)
    if (error) return { error: error.message }

    revalidatePath(`/build/${id}`)
    return { error: null }
  } catch (error) {
    return {
      error: error instanceof BuilderError ? error.message : 'That change could not be made.',
    }
  }
}

/** Save an edited spec. Nothing is trusted until its engine has parsed it. */
export async function saveSpec(id: string, spec: unknown): Promise<BuildResult> {
  const { tool, supabase } = await ownedTool(id)

  if (!isEngineId(tool.engine)) return { error: 'This tool has no engine set.' }

  if (!parseSpec(tool.engine as EngineId, spec)) {
    return {
      error:
        'Those changes left the tool in a shape it cannot run in — something required is missing ' +
        'or the wrong type. Nothing was saved.',
    }
  }

  const { error } = await supabase.from('tools').update({ spec }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/build/${id}`)
  return { error: null }
}

export async function saveDetails(id: string, formData: FormData): Promise<BuildResult> {
  const { supabase } = await ownedTool(id)

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'A tool needs a name.' }

  const priceMajor = Number(formData.get('price') ?? 0)
  if (Number.isNaN(priceMajor) || priceMajor < 0) return { error: 'That price is not a number.' }

  const { error } = await supabase
    .from('tools')
    .update({
      title: title.slice(0, 120),
      tagline: String(formData.get('tagline') ?? '').trim().slice(0, 200),
      description: String(formData.get('description') ?? '').trim().slice(0, 2000),
      emoji: String(formData.get('emoji') ?? '🛠️').slice(0, 8) || '🛠️',
      accent: String(formData.get('accent') ?? 'indigo'),
      price_kobo: Math.round(priceMajor * 100),
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath(`/build/${id}`)
  return { error: null }
}

export async function setStatus(id: string, status: 'draft' | 'published') {
  const { tool, supabase } = await ownedTool(id)

  if (status === 'published' && !parseSpec(tool.engine as EngineId, tool.spec)) {
    return { error: 'This tool is not finished yet, so it cannot be published.' }
  }

  await supabase.from('tools').update({ status }).eq('id', id)
  revalidatePath(`/build/${id}`)
  revalidatePath('/tools')
  return { error: null }
}

export async function deleteTool(id: string) {
  const { supabase } = await ownedTool(id)
  await supabase.from('tools').delete().eq('id', id)
  revalidatePath('/tools')
  redirect('/tools')
}

// ---------------------------------------------------------------------------
// Directory rows — for this engine the data is the product
// ---------------------------------------------------------------------------

export async function addRecord(id: string, formData: FormData): Promise<BuildResult> {
  const { supabase } = await ownedTool(id)

  const data: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    const text = String(value).trim()
    if (text) data[key] = text.slice(0, 2000)
  }

  if (Object.keys(data).length === 0) return { error: 'Fill in at least one column.' }

  const { count } = await supabase
    .from('tool_records')
    .select('id', { count: 'exact', head: true })
    .eq('tool_id', id)

  const { error } = await supabase
    .from('tool_records')
    .insert({ tool_id: id, data, position: count ?? 0 })

  if (error) return { error: error.message }

  revalidatePath(`/build/${id}`)
  return { error: null }
}

export async function removeRecord(id: string, recordId: string) {
  const { supabase } = await ownedTool(id)
  await supabase.from('tool_records').delete().eq('id', recordId).eq('tool_id', id)
  revalidatePath(`/build/${id}`)
}
