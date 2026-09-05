import Link from 'next/link'
import { Avatar } from '@/components/avatar'
import { PursuitCard } from '@/components/pursuit-card'
import { EmptyState, SectionHeader } from '@/components/ui'
import { myPursuits, searchPeople, searchPursuits } from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'
import { SearchBox } from './search-box'

export const metadata = { title: 'Discover' }

const FILTERS = [
  { value: 'all', label: 'For you' },
  { value: 'business', label: 'Business' },
  { value: 'skill', label: 'Skills' },
  { value: 'life', label: 'Life' },
  { value: 'health', label: 'Health' },
  { value: 'money', label: 'Money' },
]

export default async function Discover(props: PageProps<'/discover'>) {
  const params = await props.searchParams
  const query = typeof params.q === 'string' ? params.q : ''
  const filter = typeof params.category === 'string' ? params.category : 'all'

  const { userId } = await requireOnboardedProfile()

  const [pursuits, people, memberships] = await Promise.all([
    searchPursuits(query),
    query ? searchPeople(query, 8) : Promise.resolve([]),
    myPursuits(userId),
  ])

  const joined = new Set(memberships.map((membership) => membership.pursuit_id))
  const filtered =
    filter === 'all' ? pursuits : pursuits.filter((pursuit) => pursuit.category === filter)

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">Discover</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Search for the outcome you want. If nobody is pursuing it yet, start it.
      </p>

      <div className="mt-5">
        <SearchBox initial={query} />
      </div>

      <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1.5">
          {FILTERS.map((option) => {
            const href =
              option.value === 'all'
                ? `/discover${query ? `?q=${encodeURIComponent(query)}` : ''}`
                : `/discover?category=${option.value}${query ? `&q=${encodeURIComponent(query)}` : ''}`
            return (
              <Link
                key={option.value}
                href={href}
                className={`chip transition-colors ${
                  filter === option.value
                    ? 'bg-accent text-white'
                    : 'bg-mist text-ink-muted hover:text-ink'
                }`}
              >
                {option.label}
              </Link>
            )
          })}
        </div>
      </div>

      <section className="mt-7">
        <SectionHeader
          title={query ? `Pursuits matching “${query}”` : 'Pursuits'}
          hint={query ? undefined : 'The outcomes most people here are working towards'}
        />
        {filtered.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((pursuit) => (
              <PursuitCard
                key={pursuit.id}
                pursuit={pursuit}
                joined={joined.has(pursuit.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="🔍"
            title={query ? 'Nothing matches that yet' : 'No pursuits here'}
            body={
              query
                ? 'You could be the first person pursuing this. Create it and others will find it.'
                : 'Try another category.'
            }
          >
            <Link
              href={`/pursuits/new${query ? `?title=${encodeURIComponent(query)}` : ''}`}
              className="btn btn-primary"
            >
              Create this pursuit
            </Link>
          </EmptyState>
        )}
      </section>

      {people.length > 0 ? (
        <section className="mt-8">
          <SectionHeader title="People" />
          <ul className="card divide-y divide-line">
            {people.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/u/${person.handle}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-mist"
                >
                  <Avatar profile={person} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {person.full_name}
                    </p>
                    <p className="truncate text-[12px] text-ink-muted">{person.headline}</p>
                  </div>
                  {person.location ? (
                    <span className="hidden shrink-0 text-[11px] text-ink-faint sm:block">
                      {person.location}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
