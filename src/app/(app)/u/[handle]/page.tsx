import Link from 'next/link'
import { notFound } from 'next/navigation'
import { redirect } from 'next/navigation'
import { Avatar } from '@/components/avatar'
import { ConnectButton } from '@/components/connect-button'
import { Chip, ProgressBar, SectionHeader, timeAgo } from '@/components/ui'
import { accent } from '@/lib/accent'
import { requireOnboardedProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import type { Ask, Membership, Profile, Pursuit, Stage } from '@/lib/types'

export async function generateMetadata(props: PageProps<'/u/[handle]'>) {
  const { handle } = await props.params
  return { title: `@${handle}` }
}

export default async function PublicProfile(props: PageProps<'/u/[handle]'>) {
  const { handle } = await props.params
  const { profile: me, userId } = await requireOnboardedProfile()

  if (handle === me.handle) redirect('/profile')

  const supabase = await supabaseServer()
  const { data } = await supabase.from('profiles').select('*').eq('handle', handle).maybeSingle()
  if (!data) notFound()

  const person = data as Profile

  const [{ data: theirMemberships }, { data: myMemberships }, { data: asks }, { data: connection }] =
    await Promise.all([
      supabase
        .from('memberships')
        .select('*, pursuit:pursuits(*), stage:stages(*)')
        .eq('user_id', person.id),
      supabase.from('memberships').select('pursuit_id').eq('user_id', userId),
      supabase.from('asks').select('*').eq('user_id', person.id).eq('status', 'open').limit(10),
      supabase
        .from('connections')
        .select('status')
        .or(
          `and(requester_id.eq.${userId},addressee_id.eq.${person.id}),and(requester_id.eq.${person.id},addressee_id.eq.${userId})`,
        )
        .maybeSingle(),
    ])

  const theirs = (theirMemberships ?? []) as (Membership & {
    pursuit: Pursuit
    stage: Stage | null
  })[]
  const mine = new Set((myMemberships ?? []).map((row: { pursuit_id: string }) => row.pursuit_id))
  const shared = theirs.filter((membership) => mine.has(membership.pursuit_id))
  const openAsks = (asks ?? []) as Ask[]

  const reason =
    shared.length > 0
      ? `Also pursuing ${shared[0].pursuit.title}`
      : `Found through ${person.headline || 'Commons'}`

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex items-start gap-4">
        <Avatar profile={person} size="xl" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">{person.full_name}</h1>
          <p className="text-sm text-ink-muted">@{person.handle}</p>
          {person.headline ? (
            <p className="mt-1.5 text-sm text-ink-soft">{person.headline}</p>
          ) : null}
          {person.location ? (
            <p className="mt-0.5 text-[12px] text-ink-faint">{person.location}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <div className="w-40">
          <ConnectButton
            profileId={person.id}
            handle={person.handle}
            pursuitId={shared[0]?.pursuit_id ?? null}
            reason={reason}
            state={connection?.status}
          />
        </div>
        {shared.length > 0 ? (
          <span className="chip bg-accent-soft text-accent">
            {shared.length} pursuit{shared.length === 1 ? '' : 's'} in common
          </span>
        ) : null}
      </div>

      {person.bio ? <p className="prose-commons mt-6">{person.bio}</p> : null}

      {person.skills.length > 0 ? (
        <div className="mt-6">
          <p className="mb-2 text-[11px] font-medium tracking-wide text-ink-muted uppercase">
            Can help with
          </p>
          <div className="flex flex-wrap gap-1.5">
            {person.skills.map((skill) => (
              <Chip key={skill} tone="accent">
                {skill}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {openAsks.length > 0 ? (
        <section className="mt-9">
          <SectionHeader title="Open right now" hint="What they need, and what they are offering" />
          <ul className="space-y-2.5">
            {openAsks.map((ask) => (
              <li key={ask.id} className="card p-3.5">
                <div className="flex items-start gap-2.5">
                  <Chip tone={ask.kind === 'need' ? 'warn' : 'lift'}>
                    {ask.kind === 'need' ? 'Needs' : 'Offers'}
                  </Chip>
                  <p className="min-w-0 flex-1 text-[13px] leading-snug font-medium text-ink">
                    {ask.title}
                  </p>
                </div>
                <p className="mt-1.5 text-[11px] text-ink-faint">{timeAgo(ask.created_at)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {shared.length > 0 ? (
        <section className="mt-9">
          <SectionHeader title="Pursuits you both share" />
          <ul className="space-y-2.5">
            {shared.map((membership) => (
              <PursuitRow key={membership.id} membership={membership} />
            ))}
          </ul>
        </section>
      ) : null}

      {theirs.length > shared.length ? (
        <section className="mt-8">
          <SectionHeader title="Also pursuing" />
          <ul className="space-y-2.5">
            {theirs
              .filter((membership) => !mine.has(membership.pursuit_id))
              .map((membership) => (
                <PursuitRow key={membership.id} membership={membership} />
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function PursuitRow({
  membership,
}: {
  membership: Membership & { pursuit: Pursuit; stage: Stage | null }
}) {
  const tone = accent(membership.pursuit.accent)
  return (
    <li>
      <Link href={`/p/${membership.pursuit.slug}`} className="card card-hover block p-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-base ${tone.soft}`}
          >
            {membership.pursuit.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink">
              {membership.pursuit.title}
            </p>
            <p className="truncate text-[11px] text-ink-muted">
              {membership.stage?.name ?? 'No stage set'}
            </p>
          </div>
          <span className="shrink-0 text-[12px] font-medium text-ink-muted tabular-nums">
            {membership.progress}%
          </span>
        </div>
        <div className="mt-2.5">
          <ProgressBar value={membership.progress} />
        </div>
        {membership.intent ? (
          <p className="mt-2.5 text-[12px] text-ink-muted">
            &ldquo;{membership.intent}&rdquo;
          </p>
        ) : null}
      </Link>
    </li>
  )
}
