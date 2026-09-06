import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Standing in Commons.
 *
 * You earn points when other people find you worth their time: they connect
 * with you, they mark what you wrote as useful, they upvote something you
 * shared. You cannot award them to yourself, except for finishing a stage.
 *
 * The same numbers live in the database (points_for) and the insert policy
 * refuses any row that disagrees with them, so a forged client cannot mint
 * points. These constants exist so the interface can explain the rules.
 */
export const POINTS = {
  connection_received: 5,
  connection_made: 1,
  post_useful: 2,
  reply_useful: 2,
  resource_upvote: 3,
  stage_completed: 10,
  quiz_taken: 2,
  tool_used: 2,
} as const

export type PointKind = keyof typeof POINTS

/** What a person had to do to earn each kind, in words. */
export const POINT_REASONS: Record<PointKind, string> = {
  connection_received: 'Someone asked to connect with you',
  connection_made: 'You connected with someone',
  post_useful: 'Someone found your post useful',
  reply_useful: 'Someone found your reply useful',
  resource_upvote: 'Someone upvoted a resource you shared',
  stage_completed: 'You finished a stage',
  quiz_taken: 'Someone took a quiz you wrote',
  tool_used: 'Someone used a tool you built',
}

/** Twenty points inside this pursuit, or a hundred across Commons. */
export const RESOURCE_GATE = { inPursuit: 20, overall: 100 } as const

export function canAddResources(pointsInPursuit: number, totalPoints: number) {
  return pointsInPursuit >= RESOURCE_GATE.inPursuit || totalPoints >= RESOURCE_GATE.overall
}

/** How far off the gate someone is, phrased for the person who is short. */
export function gateShortfall(pointsInPursuit: number, totalPoints: number) {
  const here = Math.max(0, RESOURCE_GATE.inPursuit - pointsInPursuit)
  const anywhere = Math.max(0, RESOURCE_GATE.overall - totalPoints)
  return here <= anywhere
    ? { points: here, where: 'in this pursuit' as const }
    : { points: anywhere, where: 'across Commons' as const }
}

type Award = {
  userId: string
  actorId: string | null
  pursuitId: string | null
  kind: PointKind
  subjectType: string
  subjectId: string | null
}

/**
 * Give someone points. Silently does nothing when the row already exists,
 * which is what makes an action like "mark useful" safe to repeat.
 */
export async function awardPoints(
  supabase: SupabaseClient,
  { userId, actorId, pursuitId, kind, subjectType, subjectId }: Award,
) {
  if (actorId && actorId === userId) return

  await supabase.from('point_events').insert({
    user_id: userId,
    actor_id: actorId,
    pursuit_id: pursuitId,
    kind,
    points: POINTS[kind],
    subject_type: subjectType,
    subject_id: subjectId,
  })
}

/** Take them back when the thing that earned them is undone. */
export async function revokePoints(
  supabase: SupabaseClient,
  { userId, actorId, kind, subjectType, subjectId }: Omit<Award, 'pursuitId'>,
) {
  let query = supabase
    .from('point_events')
    .delete()
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('subject_type', subjectType)

  query = subjectId ? query.eq('subject_id', subjectId) : query.is('subject_id', null)
  query = actorId ? query.eq('actor_id', actorId) : query.is('actor_id', null)

  await query
}

/** Award a badge. Duplicates are refused by the database, not by us. */
export async function awardBadge(
  supabase: SupabaseClient,
  args: {
    userId: string
    slug: string
    pursuitId?: string | null
    stageId?: string | null
    label?: string
  },
) {
  await supabase.from('user_badges').insert({
    user_id: args.userId,
    badge_slug: args.slug,
    pursuit_id: args.pursuitId ?? null,
    stage_id: args.stageId ?? null,
    label: args.label ?? '',
  })
}
