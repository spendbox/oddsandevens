import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import { Chip, EmptyState, timeAgo } from '@/components/ui'
import { ENGINES, accent } from '@/lib/engines'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { formatPrice, type Tool } from '@/lib/types'

export const metadata = { title: 'My tools' }

export default async function ToolsPage() {
  const { userId } = await requireProfile()
  const supabase = await supabaseServer()

  const { data } = await supabase
    .from('tools')
    .select('*')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })

  const tools = (data ?? []) as Tool[]
  const published = tools.filter((tool) => tool.status === 'published')
  const runs = tools.reduce((total, tool) => total + tool.run_count, 0)

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
              Your tools
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {tools.length === 0
                ? 'Nothing built yet.'
                : `${published.length} published · ${runs.toLocaleString()} ${runs === 1 ? 'use' : 'uses'}`}
            </p>
          </div>
          <Link href="/new" className="btn btn-primary">
            New tool
          </Link>
        </div>

        {tools.length === 0 ? (
          <EmptyState
            icon="🛠️"
            title="Build your first tool"
            body="Describe what you want in a sentence. Forge works out what kind of tool it is and builds it — you edit it from there."
          >
            <Link href="/new" className="btn btn-primary">
              Describe a tool
            </Link>
          </EmptyState>
        ) : (
          <ul className="space-y-2.5">
            {tools.map((tool) => {
              const tone = accent(tool.accent)
              const engine = ENGINES[tool.engine]
              const built = tool.spec && Object.keys(tool.spec as object).length > 0

              return (
                <li key={tool.id}>
                  <Link href={`/build/${tool.id}`} className="card card-hover block p-4">
                    <div className="flex items-start gap-3.5">
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-xl ${tone.bg}`}
                      >
                        {tool.emoji}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                            {built ? tool.title : 'Building…'}
                          </h2>
                          <Chip tone={tool.status === 'published' ? 'lift' : 'neutral'}>
                            {tool.status === 'published' ? 'Live' : 'Draft'}
                          </Chip>
                          {tool.price_kobo > 0 ? (
                            <Chip tone="accent">{formatPrice(tool.price_kobo, tool.currency)}</Chip>
                          ) : null}
                        </div>

                        <p className="mt-1 line-clamp-1 text-[13px] text-ink-muted">
                          {built ? tool.tagline || tool.brief : tool.brief}
                        </p>

                        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                          {built ? <span>{engine?.emoji} {engine?.name}</span> : null}
                          <span>·</span>
                          <span>
                            {tool.run_count.toLocaleString()} {tool.run_count === 1 ? 'use' : 'uses'}
                          </span>
                          <span>·</span>
                          <span>Edited {timeAgo(tool.updated_at)}</span>
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </>
  )
}
