import { supabaseServer } from './supabase/server'
import type {
  Ask,
  CommonsEvent,
  Membership,
  MembershipWithProgress,
  Post,
  Profile,
  Pursuit,
  Quiz,
  QuizQuestion,
  Resource,
  Stage,
  StageCompletion,
  StageCount,
  Tool,
} from './types'

/**
 * Every pursuit this person is in, with progress counted from the stages they
 * have actually finished rather than a number they typed about themselves.
 */
export async function myPursuits(userId: string) {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('memberships')
    .select('*, pursuit:pursuits(*), stage:stages(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })

  const rows = (data ?? []) as (Membership & { pursuit: Pursuit; stage: Stage | null })[]
  if (rows.length === 0) return [] as MembershipWithProgress[]

  const pursuitIds = rows.map((row) => row.pursuit_id)

  const [{ data: completions }, { data: stages }] = await Promise.all([
    supabase.from('stage_completions').select('pursuit_id').eq('user_id', userId).in('pursuit_id', pursuitIds),
    supabase.from('stages').select('pursuit_id').in('pursuit_id', pursuitIds),
  ])

  const done = tally((completions ?? []) as { pursuit_id: string }[])
  const total = tally((stages ?? []) as { pursuit_id: string }[])

  return rows.map((row) => {
    const completed = done.get(row.pursuit_id) ?? 0
    const totalStages = total.get(row.pursuit_id) ?? 0
    return {
      ...row,
      completed,
      totalStages,
      progress: totalStages > 0 ? Math.round((completed / totalStages) * 100) : 0,
    }
  }) as MembershipWithProgress[]
}

function tally(rows: { pursuit_id: string }[]) {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.pursuit_id, (counts.get(row.pursuit_id) ?? 0) + 1)
  return counts
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
    .select('*, author:profiles!posts_author_id_fkey(*)')
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
    .select('*, author:profiles!asks_user_id_fkey(*)')
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
    .select('*, author:profiles!resources_user_id_fkey(*)')
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
    .from('stage_completions')
    .select('*, author:profiles!stage_completions_user_id_fkey(*), stage:stages(*)')
    .eq('pursuit_id', pursuitId)
    .order('completed_at', { ascending: false })
    .limit(25)

  return (data ?? []) as unknown as (StageCompletion & { author: Profile; stage: Stage })[]
}

/** Which stages this person has finished in a pursuit. */
export async function myCompletions(pursuitId: string, userId: string) {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('stage_completions')
    .select('*')
    .eq('pursuit_id', pursuitId)
    .eq('user_id', userId)

  return (data ?? []) as StageCompletion[]
}

export async function pursuitQuizzes(pursuitId: string) {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('quizzes')
    .select('*, author:profiles!quizzes_user_id_fkey(*), questions:quiz_questions(*)')
    .eq('pursuit_id', pursuitId)
    .order('created_at', { ascending: false })

  return (data ?? []) as unknown as (Quiz & { author: Profile; questions: QuizQuestion[] })[]
}

export async function pursuitTools(pursuitId: string) {
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('tools')
    .select('*, author:profiles!tools_user_id_fkey(*)')
    .eq('pursuit_id', pursuitId)
    .order('use_count', { ascending: false })

  return (data ?? []) as unknown as (Tool & { author: Profile })[]
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

/**
 * Finding the pursuits somebody's sentence is really about.
 *
 * "I want to learn AI automation this year" shares no whole phrase with "Learn
 * Python Properly", and a search that demands every word finds nothing — which
 * would send everyone off to create a duplicate of a pursuit that already
 * exists. So the sentence is reduced to the words that carry meaning, any one
 * of which is enough to surface a candidate, and the results are ranked by how
 * many of them actually landed.
 */
const FILLER = new Set([
  'i', 'im', 'ive', 'id', 'me', 'my', 'we', 'our', 'you', 'your', 'a', 'an', 'the',
  'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'but', 'with', 'from', 'by',
  'want', 'wants', 'wanted', 'need', 'needs', 'like', 'would', 'should', 'could',
  'can', 'do', 'does', 'how', 'what', 'when', 'where', 'why', 'help', 'trying',
  'try', 'am', 'is', 'are', 'be', 'been', 'being', 'get', 'getting', 'got',
  'this', 'that', 'these', 'those', 'it', 'its', 'year', 'years', 'month',
  'months', 'week', 'weeks', 'day', 'days', 'someday', 'soon', 'more', 'really',
  'goal', 'goals', 'about', 'into', 'up', 'out', 'own', 'first', 'next', 'new',
  // Generic verbs of intention. Almost every sentence has one, and they match
  // almost every pursuit, so they add noise rather than signal.
  'start', 'starting', 'begin', 'make', 'making', 'go', 'going', 'become', 'take',
  'have', 'having', 'find', 'finding', 'keep', 'put', 'set', 'work', 'working',
])

export function meaningfulWords(intent: string): string[] {
  return [
    ...new Set(
      intent
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 1 && !FILLER.has(word)),
    ),
  ].slice(0, 8)
}

export async function findSimilarPursuits(intent: string, limit = 6) {
  const words = meaningfulWords(intent)
  if (words.length === 0) return searchPursuits(intent, limit)

  const supabase = await supabaseServer()

  // Any one of these words is enough to be a candidate.
  const { data } = await supabase
    .from('pursuits')
    .select('*')
    .textSearch('search', words.join(' | '), { config: 'english' })
    .limit(30)

  let candidates = (data ?? []) as Pursuit[]

  // Full text stems words, but not every near-match survives it, so widen once.
  if (candidates.length === 0) {
    const { data: loose } = await supabase
      .from('pursuits')
      .select('*')
      .or(words.map((word) => `title.ilike.%${word}%,tagline.ilike.%${word}%`).join(','))
      .limit(30)
    candidates = (loose ?? []) as Pursuit[]
  }

  // A word in the title says far more than the same word buried in a tagline.
  return candidates
    .map((pursuit) => {
      const title = pursuit.title.toLowerCase()
      const tags = pursuit.tags.join(' ').toLowerCase()
      const tagline = `${pursuit.tagline} ${pursuit.description}`.toLowerCase()

      const score = words.reduce(
        (total, word) =>
          total +
          (title.includes(word) ? 30 : 0) +
          (tags.includes(word) ? 20 : 0) +
          (tagline.includes(word) ? 5 : 0),
        0,
      )

      return { pursuit, score: score + Math.min(pursuit.member_count, 999) / 1000 }
    })
    .filter((row) => row.score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.pursuit)
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
