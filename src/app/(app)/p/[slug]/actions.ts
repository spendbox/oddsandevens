'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'

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
// Progress
// ---------------------------------------------------------------------------

/**
 * Moving forward is the event the whole pursuit turns on. Recording it does
 * three things: moves the member, writes it to the pursuit's history, and — when
 * it is a real step rather than a nudge — tells the people who are where this
 * person just was.
 */
export async function updateProgress(formData: FormData) {
  const { supabase, userId } = await currentUser()

  const slug = String(formData.get('slug'))
  const pursuitId = String(formData.get('pursuit_id'))
  const stageId = String(formData.get('stage_id') || '')
  const progress = Math.max(0, Math.min(100, Number(formData.get('progress') ?? 0)))
  const note = String(formData.get('note') ?? '').trim().slice(0, 500)

  const { data: existing } = await supabase
    .from('memberships')
    .select('progress, stage_id')
    .eq('pursuit_id', pursuitId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!existing) return

  const movedStage = stageId && stageId !== existing.stage_id
  const jumped = progress - (existing.progress ?? 0) >= 10

  await supabase
    .from('memberships')
    .update({ progress, stage_id: stageId || existing.stage_id })
    .eq('pursuit_id', pursuitId)
    .eq('user_id', userId)

  await supabase.from('progress_updates').insert({
    pursuit_id: pursuitId,
    user_id: userId,
    stage_id: stageId || existing.stage_id,
    from_progress: existing.progress,
    to_progress: progress,
    note,
    is_milestone: Boolean(movedStage || jumped),
  })

  if (movedStage || jumped) {
    await notifyPeopleBehind(pursuitId, userId, stageId || existing.stage_id, slug)
  }

  refresh(slug)
}

/**
 * The self-reinforcing part. When someone moves up, the members still standing
 * at the stage they left get told that a person who just solved their problem
 * is now one step ahead — which is the moment a pursuit starts helping people
 * rather than just holding them.
 */
async function notifyPeopleBehind(
  pursuitId: string,
  userId: string,
  stageId: string | null,
  slug: string,
) {
  const supabase = await supabaseServer()

  const [{ data: mover }, { data: stages }] = await Promise.all([
    supabase.from('profiles').select('full_name, handle').eq('id', userId).maybeSingle(),
    supabase.from('stages').select('id, position').eq('pursuit_id', pursuitId).order('position'),
  ])

  const position = stages?.find((stage) => stage.id === stageId)?.position
  if (!position || !mover) return

  const behind = (stages ?? []).filter((stage) => stage.position < position).map((stage) => stage.id)
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
    members.map((member) => ({
      user_id: member.user_id,
      kind: 'progress',
      title: `${mover.full_name} just moved ahead of where you are`,
      body: 'They came through the stage you are at now. Worth asking them how.',
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

export async function toggleUseful(slug: string, postId: string) {
  const { supabase, userId } = await currentUser()

  const { data: existing } = await supabase
    .from('post_useful')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await supabase.from('post_useful').delete().eq('post_id', postId).eq('user_id', userId)
  } else {
    await supabase.from('post_useful').insert({ post_id: postId, user_id: userId })
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

  await supabase.from('resources').insert({
    pursuit_id: String(formData.get('pursuit_id')),
    user_id: userId,
    kind: String(formData.get('kind') ?? 'link'),
    title: title.slice(0, 200),
    url: String(formData.get('url') ?? '').trim() || null,
    description: String(formData.get('description') ?? '').trim().slice(0, 1000),
    stage_id: String(formData.get('stage_id') || '') || null,
  })

  refresh(String(formData.get('slug')))
}

export async function voteResource(slug: string, resourceId: string) {
  const { supabase, userId } = await currentUser()

  const { data: existing } = await supabase
    .from('resource_votes')
    .select('resource_id')
    .eq('resource_id', resourceId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await supabase.from('resource_votes').delete().eq('resource_id', resourceId).eq('user_id', userId)
  } else {
    await supabase.from('resource_votes').insert({ resource_id: resourceId, user_id: userId })
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
