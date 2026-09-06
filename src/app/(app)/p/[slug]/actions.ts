'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { awardBadge, awardPoints, revokePoints } from '@/lib/points'
import { checkFormula } from '@/lib/expression'
import type { Stage } from '@/lib/types'

async function currentUser() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, userId: user.id }
}

function refresh(slug: string) {
  revalidatePath(`/p/${slug}`, 'layout')
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export async function joinPursuit(slug: string, pursuitId: string, intent: string) {
  const { supabase, userId } = await currentUser()

  await supabase.from('memberships').insert({
    pursuit_id: pursuitId,
    user_id: userId,
    intent: intent.slice(0, 280),
  })

  refresh(slug)
}

export async function leavePursuit(slug: string, pursuitId: string) {
  const { supabase, userId } = await currentUser()
  await supabase.from('memberships').delete().eq('pursuit_id', pursuitId).eq('user_id', userId)
  refresh(slug)
  redirect('/pursuits')
}

// ---------------------------------------------------------------------------
// Finishing a stage
// ---------------------------------------------------------------------------

/**
 * You do not slide a percentage. You finish a stage, and you say how.
 *
 * The account you write becomes a post in the discussion, so the people still
 * standing where you were can read it, reply to it, and mark it useful — which
 * is also how the person who wrote it earns standing. One movement forward
 * feeds the pursuit, the writer, and everybody behind them at once.
 */
export async function completeStage(formData: FormData) {
  const { supabase, userId } = await currentUser()

  const slug = String(formData.get('slug'))
  const pursuitId = String(formData.get('pursuit_id'))
  const stageId = String(formData.get('stage_id'))
  const whatIDid = String(formData.get('what_i_did') ?? '').trim().slice(0, 4000)
  const whatWasHard = String(formData.get('what_was_hard') ?? '').trim().slice(0, 4000)

  if (!whatIDid) return

  const { data: stages } = await supabase
    .from('stages')
    .select('*')
    .eq('pursuit_id', pursuitId)
    .order('position')

  const ordered = (stages ?? []) as Stage[]
  const stage = ordered.find((item) => item.id === stageId)
  if (!stage) return

  // Already finished? Nothing to do — the unique key would refuse it anyway.
  const { data: existing } = await supabase
    .from('stage_completions')
    .select('id')
    .eq('user_id', userId)
    .eq('stage_id', stageId)
    .maybeSingle()

  if (existing) return

  const { data: post } = await supabase
    .from('posts')
    .insert({
      pursuit_id: pursuitId,
      author_id: userId,
      kind: 'reflection',
      title: `Finished: ${stage.name}`,
      body: whatWasHard
        ? `**What I did**\n${whatIDid}\n\n**What was hard, and how I got past it**\n${whatWasHard}`
        : `**What I did**\n${whatIDid}`,
      stage_id: stageId,
    })
    .select('id')
    .maybeSingle()

  await supabase.from('stage_completions').insert({
    pursuit_id: pursuitId,
    user_id: userId,
    stage_id: stageId,
    what_i_did: whatIDid,
    what_was_hard: whatWasHard,
    post_id: post?.id ?? null,
  })

  await awardPoints(supabase, {
    userId,
    actorId: null,
    pursuitId,
    kind: 'stage_completed',
    subjectType: 'stage',
    subjectId: stageId,
  })

  await awardBadge(supabase, {
    userId,
    slug: 'stage',
    pursuitId,
    stageId,
    label: stage.name,
  })

  // The first stage anyone finishes is worth marking on its own.
  const { count: finishedEverywhere } = await supabase
    .from('stage_completions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if ((finishedEverywhere ?? 0) <= 1) {
    await awardBadge(supabase, { userId, slug: 'first-steps' })
  }

  // Move to the next stage, or mark the whole journey done.
  const next = ordered.find((item) => item.position > stage.position)

  await supabase
    .from('memberships')
    .update({ stage_id: next?.id ?? stage.id })
    .eq('pursuit_id', pursuitId)
    .eq('user_id', userId)

  if (!next) {
    await awardBadge(supabase, { userId, slug: 'finisher', pursuitId })
  }

  await notifyPeopleBehind(pursuitId, userId, stage.position)

  refresh(slug)
}

/**
 * The self-reinforcing part. Somebody who has just come through a stage is the
 * most useful person alive to those still in it, so tell them.
 */
async function notifyPeopleBehind(pursuitId: string, userId: string, position: number) {
  const supabase = await supabaseServer()

  const [{ data: mover }, { data: stages }] = await Promise.all([
    supabase.from('profiles').select('full_name, handle').eq('id', userId).maybeSingle(),
    supabase.from('stages').select('id, position').eq('pursuit_id', pursuitId).order('position'),
  ])

  if (!mover) return

  const behind = (stages ?? [])
    .filter((stage: { position: number }) => stage.position <= position)
    .map((stage: { id: string }) => stage.id)

  if (behind.length === 0) return

  const { data: members } = await supabase
    .from('memberships')
    .select('user_id')
    .eq('pursuit_id', pursuitId)
    .in('stage_id', behind)
    .neq('user_id', userId)
    .limit(40)

  if (!members || members.length === 0) return

  await supabase.from('notifications').insert(
    members.map((member: { user_id: string }) => ({
      user_id: member.user_id,
      kind: 'progress',
      title: `${mover.full_name} just finished the stage you are on`,
      body: 'They wrote down how they did it. Worth reading, and asking about.',
      href: `/u/${mover.handle}`,
      actor_id: userId,
    })),
  )
}

// ---------------------------------------------------------------------------
// Discussion
// ---------------------------------------------------------------------------

export async function createPost(formData: FormData) {
  const { supabase, userId } = await currentUser()

  const slug = String(formData.get('slug'))
  const body = String(formData.get('body') ?? '').trim()
  if (!body) return

  await supabase.from('posts').insert({
    pursuit_id: String(formData.get('pursuit_id')),
    author_id: userId,
    kind: String(formData.get('kind') ?? 'update'),
    title: String(formData.get('title') ?? '').trim().slice(0, 160),
    body: body.slice(0, 8000),
    stage_id: String(formData.get('stage_id') || '') || null,
  })

  refresh(slug)
}

export async function createReply(formData: FormData) {
  const { supabase, userId } = await currentUser()

  const body = String(formData.get('body') ?? '').trim()
  if (!body) return

  const postId = String(formData.get('post_id'))
  await supabase.from('replies').insert({
    post_id: postId,
    author_id: userId,
    body: body.slice(0, 4000),
  })

  // Tell the author someone answered, unless they are replying to themselves.
  const { data: post } = await supabase
    .from('posts')
    .select('author_id, title, pursuit_id, pursuits(slug)')
    .eq('id', postId)
    .maybeSingle()

  const { data: me } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle()

  if (post && post.author_id !== userId) {
    await supabase.from('notifications').insert({
      user_id: post.author_id,
      kind: 'reply',
      title: `${me?.full_name ?? 'Someone'} replied to you`,
      body: post.title || 'Your post has a new reply.',
      href: `/p/${String(formData.get('slug'))}/discussions`,
      actor_id: userId,
    })
  }

  refresh(String(formData.get('slug')))
}

/** Marking a post useful is the main way standing is earned in Commons. */
export async function toggleUseful(slug: string, postId: string) {
  const { supabase, userId } = await currentUser()

  const { data: post } = await supabase
    .from('posts')
    .select('author_id, pursuit_id')
    .eq('id', postId)
    .maybeSingle()

  const { data: existing } = await supabase
    .from('post_useful')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await supabase.from('post_useful').delete().eq('post_id', postId).eq('user_id', userId)
    if (post) {
      await revokePoints(supabase, {
        userId: post.author_id,
        actorId: userId,
        kind: 'post_useful',
        subjectType: 'post',
        subjectId: postId,
      })
    }
  } else {
    await supabase.from('post_useful').insert({ post_id: postId, user_id: userId })
    if (post) {
      await awardPoints(supabase, {
        userId: post.author_id,
        actorId: userId,
        pursuitId: post.pursuit_id,
        kind: 'post_useful',
        subjectType: 'post',
        subjectId: postId,
      })
    }
  }

  refresh(slug)
}

/** The same, for a reply. Comments earn standing too. */
export async function toggleReplyUseful(slug: string, replyId: string) {
  const { supabase, userId } = await currentUser()

  const { data: reply } = await supabase
    .from('replies')
    .select('author_id, post:posts(pursuit_id)')
    .eq('id', replyId)
    .maybeSingle()

  const pursuitId =
    (reply as { post?: { pursuit_id: string } | null } | null)?.post?.pursuit_id ?? null

  const { data: existing } = await supabase
    .from('reply_useful')
    .select('reply_id')
    .eq('reply_id', replyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await supabase.from('reply_useful').delete().eq('reply_id', replyId).eq('user_id', userId)
    if (reply) {
      await revokePoints(supabase, {
        userId: reply.author_id,
        actorId: userId,
        kind: 'reply_useful',
        subjectType: 'reply',
        subjectId: replyId,
      })
    }
  } else {
    await supabase.from('reply_useful').insert({ reply_id: replyId, user_id: userId })
    if (reply) {
      await awardPoints(supabase, {
        userId: reply.author_id,
        actorId: userId,
        pursuitId,
        kind: 'reply_useful',
        subjectType: 'reply',
        subjectId: replyId,
      })
    }
  }

  refresh(slug)
}

// ---------------------------------------------------------------------------
// Needs and offers
// ---------------------------------------------------------------------------

export async function createAsk(formData: FormData) {
  const { supabase, userId } = await currentUser()

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return

  await supabase.from('asks').insert({
    pursuit_id: String(formData.get('pursuit_id')),
    user_id: userId,
    kind: String(formData.get('kind')) === 'offer' ? 'offer' : 'need',
    title: title.slice(0, 200),
    body: String(formData.get('body') ?? '').trim().slice(0, 2000),
    tags: String(formData.get('tags') ?? '')
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8),
  })

  refresh(String(formData.get('slug')))
}

export async function respondToAsk(formData: FormData) {
  const { supabase, userId } = await currentUser()

  const askId = String(formData.get('ask_id'))
  const body = String(formData.get('body') ?? '').trim()
  if (!body) return

  await supabase
    .from('ask_responses')
    .upsert({ ask_id: askId, user_id: userId, body: body.slice(0, 2000) }, { onConflict: 'ask_id,user_id' })

  const [{ data: ask }, { data: me }] = await Promise.all([
    supabase.from('asks').select('user_id, kind, title').eq('id', askId).maybeSingle(),
    supabase.from('profiles').select('full_name, handle').eq('id', userId).maybeSingle(),
  ])

  await awardBadge(supabase, { userId, slug: 'helper' })

  if (ask && ask.user_id !== userId) {
    await supabase.from('notifications').insert({
      user_id: ask.user_id,
      kind: 'ask',
      title:
        ask.kind === 'need'
          ? `${me?.full_name ?? 'Someone'} can help with what you asked for`
          : `${me?.full_name ?? 'Someone'} wants the help you offered`,
      body: ask.title,
      href: `/p/${String(formData.get('slug'))}/help`,
      actor_id: userId,
    })
  }

  refresh(String(formData.get('slug')))
}

export async function closeAsk(slug: string, askId: string) {
  const { supabase, userId } = await currentUser()
  await supabase.from('asks').update({ status: 'closed' }).eq('id', askId).eq('user_id', userId)
  refresh(slug)
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export async function addResource(formData: FormData) {
  const { supabase, userId } = await currentUser()

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return

  const { error } = await supabase.from('resources').insert({
    pursuit_id: String(formData.get('pursuit_id')),
    user_id: userId,
    kind: String(formData.get('kind') ?? 'link'),
    title: title.slice(0, 200),
    url: String(formData.get('url') ?? '').trim() || null,
    description: String(formData.get('description') ?? '').trim().slice(0, 1000),
    stage_id: String(formData.get('stage_id') || '') || null,
  })

  // The gate lives in a row level security policy, so a member without enough
  // standing is refused by the database rather than only by the interface.
  if (error) return

  await awardBadge(supabase, { userId, slug: 'contributor' })

  refresh(String(formData.get('slug')))
}

export async function voteResource(slug: string, resourceId: string) {
  const { supabase, userId } = await currentUser()

  const { data: resource } = await supabase
    .from('resources')
    .select('user_id, pursuit_id')
    .eq('id', resourceId)
    .maybeSingle()

  const { data: existing } = await supabase
    .from('resource_votes')
    .select('resource_id')
    .eq('resource_id', resourceId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await supabase.from('resource_votes').delete().eq('resource_id', resourceId).eq('user_id', userId)
    if (resource?.user_id) {
      await revokePoints(supabase, {
        userId: resource.user_id,
        actorId: userId,
        kind: 'resource_upvote',
        subjectType: 'resource',
        subjectId: resourceId,
      })
    }
  } else {
    await supabase.from('resource_votes').insert({ resource_id: resourceId, user_id: userId })
    if (resource?.user_id) {
      await awardPoints(supabase, {
        userId: resource.user_id,
        actorId: userId,
        pursuitId: resource.pursuit_id,
        kind: 'resource_upvote',
        subjectType: 'resource',
        subjectId: resourceId,
      })
    }
  }

  refresh(slug)
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function createEvent(formData: FormData) {
  const { supabase, userId } = await currentUser()

  const title = String(formData.get('title') ?? '').trim()
  const startsAt = String(formData.get('starts_at') ?? '')
  if (!title || !startsAt) return

  await supabase.from('events').insert({
    pursuit_id: String(formData.get('pursuit_id')),
    created_by: userId,
    kind: String(formData.get('kind') ?? 'meetup'),
    title: title.slice(0, 200),
    description: String(formData.get('description') ?? '').trim().slice(0, 2000),
    starts_at: new Date(startsAt).toISOString(),
    location: String(formData.get('location') ?? '').trim() || 'Online',
    is_virtual: String(formData.get('location') ?? '').trim().toLowerCase() === 'online' ||
      !String(formData.get('location') ?? '').trim(),
    url: String(formData.get('url') ?? '').trim() || null,
  })

  refresh(String(formData.get('slug')))
}

export async function toggleRsvp(slug: string, eventId: string) {
  const { supabase, userId } = await currentUser()

  const { data: existing } = await supabase
    .from('event_rsvps')
    .select('event_id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('user_id', userId)
  } else {
    await supabase.from('event_rsvps').insert({ event_id: eventId, user_id: userId })
  }

  refresh(slug)
}

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

export async function createQuiz(formData: FormData) {
  const { supabase, userId } = await currentUser()

  const slug = String(formData.get('slug'))
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return

  const { data: quiz } = await supabase
    .from('quizzes')
    .insert({
      pursuit_id: String(formData.get('pursuit_id')),
      user_id: userId,
      stage_id: String(formData.get('stage_id') || '') || null,
      title: title.slice(0, 200),
      description: String(formData.get('description') ?? '').trim().slice(0, 1000),
    })
    .select('id')
    .maybeSingle()

  if (!quiz) return

  // Questions arrive as parallel arrays: prompt[], option_0_0…, answer[].
  const prompts = formData.getAll('prompt').map(String)
  const answers = formData.getAll('answer').map(String)
  const explanations = formData.getAll('explanation').map(String)

  const questions = prompts
    .map((prompt, index) => {
      const options = formData
        .getAll(`option_${index}`)
        .map(String)
        .map((option) => option.trim())
        .filter(Boolean)

      const correct = Number(answers[index] ?? 0)

      if (!prompt.trim() || options.length < 2) return null
      return {
        quiz_id: quiz.id,
        position: index + 1,
        prompt: prompt.trim().slice(0, 500),
        options: options.slice(0, 6),
        correct_index: Math.min(Math.max(0, correct), options.length - 1),
        explanation: (explanations[index] ?? '').trim().slice(0, 500),
      }
    })
    .filter((question): question is NonNullable<typeof question> => question !== null)

  if (questions.length === 0) {
    await supabase.from('quizzes').delete().eq('id', quiz.id)
    return
  }

  await supabase.from('quiz_questions').insert(questions)
  await awardBadge(supabase, { userId, slug: 'quizmaster' })

  refresh(slug)
}

/**
 * Taking somebody's quiz rewards the person who wrote it. The score is worked
 * out on the server so a wrong answer cannot be talked into being right.
 */
export async function submitQuiz(formData: FormData) {
  const { supabase, userId } = await currentUser()

  const slug = String(formData.get('slug'))
  const quizId = String(formData.get('quiz_id'))

  const [{ data: quiz }, { data: questions }] = await Promise.all([
    supabase.from('quizzes').select('user_id, pursuit_id').eq('id', quizId).maybeSingle(),
    supabase.from('quiz_questions').select('id, position, correct_index').eq('quiz_id', quizId).order('position'),
  ])

  if (!quiz || !questions || questions.length === 0) return

  let score = 0
  for (const question of questions as { id: string; correct_index: number }[]) {
    if (Number(formData.get(`q_${question.id}`) ?? -1) === question.correct_index) score += 1
  }

  await supabase
    .from('quiz_attempts')
    .upsert(
      { quiz_id: quizId, user_id: userId, score, total: questions.length },
      { onConflict: 'quiz_id,user_id' },
    )

  await awardPoints(supabase, {
    userId: quiz.user_id,
    actorId: userId,
    pursuitId: quiz.pursuit_id,
    kind: 'quiz_taken',
    subjectType: 'quiz',
    subjectId: quizId,
  })

  refresh(slug)
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export async function createTool(formData: FormData) {
  const { supabase, userId } = await currentUser()

  const slug = String(formData.get('slug'))
  const kind = String(formData.get('kind')) === 'calculator' ? 'calculator' : 'checklist'
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return

  let config: Record<string, unknown>

  if (kind === 'checklist') {
    const items = formData
      .getAll('item')
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30)
    if (items.length === 0) return
    config = { items }
  } else {
    const keys = formData.getAll('input_key').map(String)
    const labels = formData.getAll('input_label').map(String)

    const inputs = keys
      .map((key, index) => ({
        key: key.trim().replace(/[^a-zA-Z0-9_]/g, '_'),
        label: (labels[index] ?? key).trim(),
      }))
      .filter((input) => input.key && input.label)
      .slice(0, 8)

    const formula = String(formData.get('formula') ?? '').trim()
    if (inputs.length === 0 || checkFormula(formula, inputs.map((input) => input.key))) return

    config = { inputs, formula, unit: String(formData.get('unit') ?? '').trim().slice(0, 30) }
  }

  await supabase.from('tools').insert({
    pursuit_id: String(formData.get('pursuit_id')),
    user_id: userId,
    stage_id: String(formData.get('stage_id') || '') || null,
    kind,
    title: title.slice(0, 200),
    description: String(formData.get('description') ?? '').trim().slice(0, 1000),
    config,
  })

  await awardBadge(supabase, { userId, slug: 'toolmaker' })

  refresh(slug)
}

/** Recorded once per person, so a tool's count means people, not clicks. */
export async function recordToolUse(slug: string, toolId: string) {
  const { supabase, userId } = await currentUser()

  const { data: tool } = await supabase
    .from('tools')
    .select('user_id, pursuit_id')
    .eq('id', toolId)
    .maybeSingle()

  const { data: existing } = await supabase
    .from('tool_uses')
    .select('tool_id')
    .eq('tool_id', toolId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return

  await supabase.from('tool_uses').insert({ tool_id: toolId, user_id: userId })

  if (tool) {
    await awardPoints(supabase, {
      userId: tool.user_id,
      actorId: userId,
      pursuitId: tool.pursuit_id,
      kind: 'tool_used',
      subjectType: 'tool',
      subjectId: toolId,
    })
  }

  refresh(slug)
}
