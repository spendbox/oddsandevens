import { supabaseServer } from './supabase/server'
import type {
  Ask,
  CommonsEvent,
  Membership,
  Post,
  Profile,
  ProgressUpdate,
  Pursuit,
  Resource,
  Stage,
  StageCount,
} from './types'

/** Every pursuit this person is in, with the pursuit and their stage attached. */
export async function myPursuits(userId: string) {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('memberships')
    .select('*, pursuit:pursuits(*), stage:stages(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })

  return (data ?? []) as (Membership & { pursuit: Pursuit; stage: Stage | null })[]
}

export async function pursuitBySlug(slug: string) {
  const supabase = await supabaseServer()
  const { data } = await supabase.from('pursuits').select('*').eq('slug', slug).maybeSingle()
  return data as Pursuit | null
}

export async function pursuitStages(pursuitId: string) {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('stages')
    .select('*')
    .eq('pursuit_id', pursuitId)
    .order('position')
  return (data ?? []) as Stage[]
}

export async function myMembership(pursuitId: string, userId: string) {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('memberships')
    .select('*')
    .eq('pursuit_id', pursuitId)
    .eq('user_id', userId)
    .maybeSingle()
  return data as Membership | null
}

/** The two numbers at the top of every pursuit: how far everyone has come. */
export async function pursuitProgress(pursuitId: string) {
  const supabase = await supabaseServer()
  const [{ data: collective }, { data: counts }] = await Promise.all([
    supabase.rpc('collective_progress', { p_pursuit: pursuitId }),
    supabase.rpc('stage_counts', { p_pursuit: pursuitId }),
  ])

  return {
    collective: (collective as number | null) ?? 0,
    stages: (counts ?? []) as StageCount[],
  }
}

export async function pursuitMembers(pursuitId: string, limit = 200) {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('memberships')
    .select('*, profile:profiles(*)')
    .eq('pursuit_id', pursuitId)
    .limit(limit)

  return (data ?? []) as (Membership & { profile: Profile })[]
}

export async function pursuitPosts(pursuitId: string, kind?: string) {
  const supabase = await supabaseServer()
  let query = supabase
    .from('posts')
    .select('*, author:profiles(*)')
    .eq('pursuit_id', pursuitId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (kind && kind !== 'all') query = query.eq('kind', kind)

  const { data } = await query
  return (data ?? []) as (Post & { author: Profile })[]
}

export async function pursuitAsks(pursuitId: string) {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('asks')
    .select('*, author:profiles(*)')
    .eq('pursuit_id', pursuitId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(60)

  return (data ?? []) as (Ask & { author: Profile })[]
}

export async function pursuitResources(pursuitId: string) {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('resources')
    .select('*, author:profiles(*)')
    .eq('pursuit_id', pursuitId)
    .order('vote_count', { ascending: false })
    .limit(80)

  return (data ?? []) as (Resource & { author: Profile | null })[]
}

export async function pursuitEvents(pursuitId: string) {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('pursuit_id', pursuitId)
    .gte('starts_at', new Date(Date.now() - 86_400_000).toISOString())
    .order('starts_at')
    .limit(30)

  return (data ?? []) as CommonsEvent[]
}

export async function pursuitProgressFeed(pursuitId: string) {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('progress_updates')
    .select('*, author:profiles(*)')
    .eq('pursuit_id', pursuitId)
    .order('created_at', { ascending: false })
    .limit(25)

  return (data ?? []) as (ProgressUpdate & { author: Profile })[]
}

/** Needs and offers people have posted, used to explain why two people match. */
export async function asksByUser(pursuitId: string) {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('asks')
    .select('*')
    .eq('pursuit_id', pursuitId)
    .eq('status', 'open')

  const byUser = new Map<string, Ask[]>()
  for (const ask of (data ?? []) as Ask[]) {
    byUser.set(ask.user_id, [...(byUser.get(ask.user_id) ?? []), ask])
  }
  return byUser
}

export async function searchPursuits(query: string, limit = 24) {
  const supabase = await supabaseServer()

  if (!query.trim()) {
    const { data } = await supabase
      .from('pursuits')
      .select('*')
      .order('member_count', { ascending: false })
      .limit(limit)
    return (data ?? []) as Pursuit[]
  }

  // Full text first — it understands that "profitable saas company" and
  // "Build a Profitable SaaS Company" are the same intent.
  const { data: matches } = await supabase
    .from('pursuits')
    .select('*')
    .textSearch('search', query, { type: 'websearch', config: 'english' })
    .limit(limit)

  if (matches && matches.length > 0) return matches as Pursuit[]

  // Then a plain contains search, for partial words full text will not match.
  const { data: fallback } = await supabase
    .from('pursuits')
    .select('*')
    .or(`title.ilike.%${query}%,tagline.ilike.%${query}%`)
    .limit(limit)

  return (fallback ?? []) as Pursuit[]
}

export async function searchPeople(query: string, limit = 24) {
  const supabase = await supabaseServer()
  let request = supabase.from('profiles').select('*').limit(limit)

  if (query.trim()) {
    request = request.or(
      `full_name.ilike.%${query}%,handle.ilike.%${query}%,headline.ilike.%${query}%`,
    )
  }

  const { data } = await request
  return (data ?? []) as Profile[]
}
