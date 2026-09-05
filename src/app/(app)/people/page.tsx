import Link from 'next/link'
import { Avatar } from '@/components/avatar'
import { ConnectButton } from '@/components/connect-button'
import { Chip, EmptyState, SectionHeader, timeAgo } from '@/components/ui'
import { requireOnboardedProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import type { Connection, Profile } from '@/lib/types'
import { AnswerButtons } from './answer-buttons'

export const metadata = { title: 'People' }

export default async function People() {
  const { profile, userId } = await requireOnboardedProfile()
  const supabase = await supabaseServer()

  const [{ data: incoming }, { data: outgoing }, { data: accepted }] = await Promise.all([
    supabase
      .from('connections')
      .select('*, requester:profiles!connections_requester_id_fkey(*)')
      .eq('addressee_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('connections')
      .select('*, addressee:profiles!connections_addressee_id_fkey(*)')
      .eq('requester_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('connections')
      .select(
        '*, requester:profiles!connections_requester_id_fkey(*), addressee:profiles!connections_addressee_id_fkey(*)',
      )
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false }),
  ])

  const requests = (incoming ?? []) as unknown as (Connection & { requester: Profile })[]
  const sent = (outgoing ?? []) as unknown as (Connection & { addressee: Profile })[]
  const connections = ((accepted ?? []) as unknown as (Connection & {
    requester: Profile
    addressee: Profile
  })[]).map((row) => (row.requester_id === userId ? row.addressee : row.requester))

  // Members of your pursuits you have not connected with yet.
  const { data: memberships } = await supabase
    .from('memberships')
    .select('pursuit_id')
    .eq('user_id', userId)

  const pursuitIds = (memberships ?? []).map((row: { pursuit_id: string }) => row.pursuit_id)
  const knownIds = new Set([
    userId,
    ...connections.map((person) => person.id),
    ...requests.map((row) => row.requester_id),
    ...sent.map((row) => row.addressee_id),
  ])

  const { data: sharedMembers } = pursuitIds.length
    ? await supabase
        .from('memberships')
        .select('user_id, profile:profiles(*), pursuit:pursuits(title, slug)')
        .in('pursuit_id', pursuitIds)
        .limit(60)
    : { data: [] as never[] }

  const suggestions = ((sharedMembers ?? []) as unknown as {
    user_id: string
    profile: Profile
    pursuit: { title: string; slug: string }
  }[])
    .filter((row) => row.profile && !knownIds.has(row.user_id))
    .slice(0, 8)

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">People</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Everyone here shares a pursuit with you. That is the only way onto this page.
      </p>

      {requests.length > 0 ? (
        <section className="mt-7">
          <SectionHeader title="Wants to connect" hint="With the reason they gave" />
          <ul className="space-y-3">
            {requests.map((request) => (
              <li key={request.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <Avatar profile={request.requester} size="md" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/u/${request.requester.handle}`}
                      className="text-sm font-semibold text-ink hover:text-accent"
                    >
                      {request.requester.full_name}
                    </Link>
                    <p className="truncate text-[12px] text-ink-muted">
                      {request.requester.headline}
                    </p>
                    {request.reason ? (
                      <p className="mt-2 rounded-[10px] bg-accent-soft px-3 py-2 text-[12px] leading-relaxed text-accent">
                        {request.reason}
                      </p>
                    ) : null}
                    <p className="mt-1.5 text-[11px] text-ink-faint">
                      {timeAgo(request.created_at)}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <AnswerButtons connectionId={request.id} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <SectionHeader
          title="Your connections"
          hint={connections.length > 0 ? undefined : 'Nobody yet'}
        />
        {connections.length > 0 ? (
          <ul className="card divide-y divide-line">
            {connections.map((person) => (
              <li key={person.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar profile={person} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/u/${person.handle}`}
                    className="truncate text-[13px] font-semibold text-ink hover:text-accent"
                  >
                    {person.full_name}
                  </Link>
                  <p className="truncate text-[12px] text-ink-muted">{person.headline}</p>
                </div>
                <Link href={`/messages/${person.handle}`} className="btn btn-quiet shrink-0">
                  Message
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="🤝"
            title="No connections yet"
            body="Open a pursuit and look at who Commons suggests. Every suggestion comes with the reason attached."
          >
            <Link href="/pursuits" className="btn btn-primary">
              Go to your pursuits
            </Link>
          </EmptyState>
        )}
      </section>

      {sent.length > 0 ? (
        <section className="mt-8">
          <SectionHeader title="Waiting on them" />
          <ul className="card divide-y divide-line">
            {sent.map((request) => (
              <li key={request.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar profile={request.addressee} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {request.addressee.full_name}
                  </p>
                  <p className="truncate text-[12px] text-ink-muted">
                    Sent {timeAgo(request.created_at)}
                  </p>
                </div>
                <Chip>Pending</Chip>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {suggestions.length > 0 ? (
        <section className="mt-8">
          <SectionHeader title="Also in your pursuits" />
          <ul className="grid gap-3 sm:grid-cols-2">
            {suggestions.map((row) => (
              <li key={row.user_id} className="card p-4">
                <div className="flex items-start gap-3">
                  <Avatar profile={row.profile} size="md" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/u/${row.profile.handle}`}
                      className="block truncate text-sm font-semibold text-ink hover:text-accent"
                    >
                      {row.profile.full_name}
                    </Link>
                    <p className="truncate text-[12px] text-ink-muted">{row.profile.headline}</p>
                    <p className="mt-1 truncate text-[11px] text-ink-faint">
                      Also in {row.pursuit.title}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <ConnectButton
                    profileId={row.profile.id}
                    handle={row.profile.handle}
                    pursuitId={null}
                    reason={`Also pursuing ${row.pursuit.title}`}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="sr-only">Signed in as {profile.handle}</p>
    </div>
  )
}
