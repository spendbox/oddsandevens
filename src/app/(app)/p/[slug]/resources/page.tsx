import { notFound } from 'next/navigation'
import { Avatar } from '@/components/avatar'
import { Chip, EmptyState, SectionHeader } from '@/components/ui'
import {
  myMembership,
  pursuitBySlug,
  pursuitResources,
  pursuitStages,
} from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { ResourceComposer, VoteButton } from './resource-ui'

const KIND_LABEL: Record<string, string> = {
  book: 'Book',
  tool: 'Tool',
  template: 'Template',
  course: 'Course',
  link: 'Link',
  experience: 'Experience',
}

const KIND_ICON: Record<string, string> = {
  book: '📕',
  tool: '🔧',
  template: '📄',
  course: '🎓',
  link: '🔗',
  experience: '💬',
}

export default async function Resources(props: PageProps<'/p/[slug]/resources'>) {
  const { slug } = await props.params
  const { userId } = await requireOnboardedProfile()

  const pursuit = await pursuitBySlug(slug)
  if (!pursuit) notFound()

  const [membership, stages, resources] = await Promise.all([
    myMembership(pursuit.id, userId),
    pursuitStages(pursuit.id),
    pursuitResources(pursuit.id),
  ])

  const supabase = await supabaseServer()
  const { data: votes } = resources.length
    ? await supabase
        .from('resource_votes')
        .select('resource_id')
        .eq('user_id', userId)
        .in(
          'resource_id',
          resources.map((resource) => resource.id),
        )
    : { data: [] as never[] }

  const voted = new Set((votes ?? []).map((row: { resource_id: string }) => row.resource_id))

  // Grouped by the stage they help with, so a beginner is not handed the
  // fundraising material and a founder is not handed the syntax course.
  const byStage = new Map<string, typeof resources>()
  const unattached: typeof resources = []
  for (const resource of resources) {
    if (resource.stage_id) {
      byStage.set(resource.stage_id, [...(byStage.get(resource.stage_id) ?? []), resource])
    } else {
      unattached.push(resource)
    }
  }

  return (
    <div className="space-y-8">
      {membership ? (
        <ResourceComposer slug={slug} pursuitId={pursuit.id} stages={stages} />
      ) : null}

      {resources.length === 0 ? (
        <EmptyState
          icon="📚"
          title="The knowledge base is empty"
          body="Every pursuit ends up answering the same questions. Resources are how it stops answering them one person at a time."
        />
      ) : (
        <>
          {stages
            .filter((stage) => (byStage.get(stage.id) ?? []).length > 0)
            .map((stage) => (
              <section key={stage.id}>
                <SectionHeader title={`For ${stage.name.toLowerCase()}`} hint={stage.description} />
                <ul className="grid gap-3 sm:grid-cols-2">
                  {(byStage.get(stage.id) ?? []).map((resource) => (
                    <ResourceCard
                      key={resource.id}
                      resource={resource}
                      slug={slug}
                      voted={voted.has(resource.id)}
                    />
                  ))}
                </ul>
              </section>
            ))}

          {unattached.length > 0 ? (
            <section>
              <SectionHeader title="Useful at any stage" />
              <ul className="grid gap-3 sm:grid-cols-2">
                {unattached.map((resource) => (
                  <ResourceCard
                    key={resource.id}
                    resource={resource}
                    slug={slug}
                    voted={voted.has(resource.id)}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

function ResourceCard({
  resource,
  slug,
  voted,
}: {
  resource: Awaited<ReturnType<typeof pursuitResources>>[number]
  slug: string
  voted: boolean
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="text-base leading-none">{KIND_ICON[resource.kind] ?? '🔗'}</span>
          <div className="min-w-0">
            <p className="text-[14px] leading-snug font-semibold text-ink">{resource.title}</p>
            <Chip>{KIND_LABEL[resource.kind] ?? 'Link'}</Chip>
          </div>
        </div>
        <VoteButton
          slug={slug}
          resourceId={resource.id}
          count={resource.vote_count}
          voted={voted}
        />
      </div>

      {resource.description ? (
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">{resource.description}</p>
      ) : null}

      {resource.author ? (
        <div className="mt-3 flex items-center gap-1.5">
          <Avatar profile={resource.author} size="xs" />
          <span className="text-[11px] text-ink-faint">
            Shared by {resource.author.full_name}
          </span>
        </div>
      ) : null}
    </>
  )

  return (
    <li className="card card-hover p-4">
      {resource.url ? (
        <a href={resource.url} target="_blank" rel="noopener noreferrer" className="block">
          {body}
          <span className="mt-2.5 block truncate text-[11px] text-accent">{resource.url}</span>
        </a>
      ) : (
        body
      )}
    </li>
  )
}
