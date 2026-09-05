import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Avatar } from '@/components/avatar'
import { Chip, EmptyState, SectionHeader, timeAgo } from '@/components/ui'
import { myMembership, pursuitAsks, pursuitBySlug } from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import type { Ask, Profile } from '@/lib/types'
import { AskComposer, RespondForm } from './help-ui'

/**
 * Needs and offers are matched on the tags people gave them plus the skills on
 * their profile, so a need can say "three people here can do this" instead of
 * sitting unanswered in a feed.
 */
function matchOffers(need: Ask, offers: (Ask & { author: Profile })[]) {
  const wanted = new Set(need.tags.map((tag) => tag.toLowerCase()))
  const haystack = `${need.title} ${need.body}`.toLowerCase()

  return offers
    .filter((offer) => offer.user_id !== need.user_id)
    .map((offer) => {
      const sharedTags = offer.tags.filter((tag) => wanted.has(tag.toLowerCase()))
      const skillHit = offer.author.skills.filter(
        (skill) => skill.length > 3 && haystack.includes(skill.toLowerCase()),
      )
      return { offer, score: sharedTags.length * 2 + skillHit.length }
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((row) => row.offer)
}

export default async function Help(props: PageProps<'/p/[slug]/help'>) {
  const { slug } = await props.params
  const { profile, userId } = await requireOnboardedProfile()

  const pursuit = await pursuitBySlug(slug)
  if (!pursuit) notFound()

  const [membership, asks] = await Promise.all([
    myMembership(pursuit.id, userId),
    pursuitAsks(pursuit.id),
  ])

  const needs = asks.filter((ask) => ask.kind === 'need')
  const offers = asks.filter((ask) => ask.kind === 'offer')

  const supabase = await supabaseServer()
  const { data: responseRows } = asks.length
    ? await supabase
        .from('ask_responses')
        .select('ask_id, user_id, body, author:profiles(*)')
        .in(
          'ask_id',
          asks.map((ask) => ask.id),
        )
    : { data: [] as never[] }

  const responses = new Map<string, { user_id: string; body: string; author: Profile }[]>()
  // The generated types treat an embedded profile as an array; it is one row.
  const rows = (responseRows ?? []) as unknown as {
    ask_id: string
    user_id: string
    body: string
    author: Profile
  }[]

  for (const row of rows) {
    responses.set(row.ask_id, [...(responses.get(row.ask_id) ?? []), row])
  }

  return (
    <div className="space-y-8">
      {membership ? <AskComposer slug={slug} pursuitId={pursuit.id} profile={profile} /> : null}

      <section>
        <SectionHeader
          title="I need…"
          hint="What people here are asking for. If you can answer one, you are the reason this works."
        />
        {needs.length > 0 ? (
          <ul className="space-y-3">
            {needs.map((need) => (
              <AskCard
                key={need.id}
                ask={need}
                slug={slug}
                canRespond={Boolean(membership) && need.user_id !== userId}
                mine={need.user_id === userId}
                responses={responses.get(need.id) ?? []}
                suggestions={matchOffers(need, offers)}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="🙋"
            title="Nobody has asked for anything yet"
            body="Post what would move you forward fastest. Somebody here has already solved it."
          />
        )}
      </section>

      <section>
        <SectionHeader
          title="I can help with…"
          hint="What people here are offering"
        />
        {offers.length > 0 ? (
          <ul className="space-y-3">
            {offers.map((offer) => (
              <AskCard
                key={offer.id}
                ask={offer}
                slug={slug}
                canRespond={Boolean(membership) && offer.user_id !== userId}
                mine={offer.user_id === userId}
                responses={responses.get(offer.id) ?? []}
                suggestions={[]}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="💡"
            title="No offers yet"
            body="Name one thing you would happily help another member with."
          />
        )}
      </section>
    </div>
  )
}

function AskCard({
  ask,
  slug,
  canRespond,
  mine,
  responses,
  suggestions,
}: {
  ask: Ask & { author: Profile }
  slug: string
  canRespond: boolean
  mine: boolean
  responses: { user_id: string; body: string; author: Profile }[]
  suggestions: (Ask & { author: Profile })[]
}) {
  return (
    <li className="card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar profile={ask.author} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Chip tone={ask.kind === 'need' ? 'warn' : 'lift'}>
              {ask.kind === 'need' ? 'I need' : 'I can help'}
            </Chip>
            <Link
              href={`/u/${ask.author.handle}`}
              className="text-[12px] font-medium text-ink hover:text-accent"
            >
              {ask.author.full_name}
            </Link>
            <span className="text-[11px] text-ink-faint">· {timeAgo(ask.created_at)}</span>
          </div>

          <h3 className="mt-2 text-[15px] leading-snug font-semibold tracking-[-0.01em] text-ink">
            {ask.title}
          </h3>

          {ask.body ? <div className="prose-commons mt-1.5">{ask.body}</div> : null}

          {ask.tags.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {ask.tags.map((tag) => (
                <Chip key={tag}>{tag}</Chip>
              ))}
            </div>
          ) : null}

          {/* The match: somebody in this pursuit already said they can do this. */}
          {suggestions.length > 0 ? (
            <div className="mt-3.5 rounded-[10px] bg-accent-soft p-3">
              <p className="text-[11px] font-medium tracking-wide text-accent uppercase">
                Matched in this pursuit
              </p>
              <ul className="mt-2 space-y-2">
                {suggestions.map((offer) => (
                  <li key={offer.id} className="flex items-start gap-2.5">
                    <Avatar profile={offer.author} size="xs" />
                    <div className="min-w-0">
                      <Link
                        href={`/u/${offer.author.handle}`}
                        className="text-[12px] font-semibold text-ink hover:text-accent"
                      >
                        {offer.author.full_name}
                      </Link>
                      <p className="truncate text-[12px] text-ink-soft">{offer.title}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {responses.length > 0 ? (
            <ul className="mt-3.5 space-y-2.5 border-l-2 border-line pl-4">
              {responses.map((response) => (
                <li key={response.user_id} className="flex items-start gap-2.5">
                  <Avatar profile={response.author} size="xs" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-ink">
                      {response.author.full_name}
                    </p>
                    <div className="prose-commons mt-0.5 text-[13px]">{response.body}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {canRespond ? (
            <RespondForm slug={slug} askId={ask.id} kind={ask.kind} />
          ) : mine ? (
            <p className="mt-3 text-[11px] text-ink-faint">
              {responses.length === 0
                ? 'Waiting for someone to answer.'
                : `${responses.length} ${responses.length === 1 ? 'person has' : 'people have'} answered.`}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  )
}
