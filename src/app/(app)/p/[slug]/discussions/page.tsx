import { notFound } from 'next/navigation'
import { Avatar } from '@/components/avatar'
import { Chip, EmptyState, timeAgo } from '@/components/ui'
import {
  myMembership,
  pursuitBySlug,
  pursuitPosts,
  pursuitStages,
} from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import type { Profile, Reply } from '@/lib/types'
import { Composer, KindFilter, PostActions, ReplyForm } from './discussion-ui'

const KIND_TONE = {
  question: 'sky',
  update: 'neutral',
  insight: 'accent',
  win: 'lift',
} as const

const KIND_LABEL = {
  question: 'Question',
  update: 'Update',
  insight: 'What I learned',
  win: 'Win',
} as const

export default async function Discussions(props: PageProps<'/p/[slug]/discussions'>) {
  const { slug } = await props.params
  const { kind } = await props.searchParams
  const { profile, userId } = await requireOnboardedProfile()

  const pursuit = await pursuitBySlug(slug)
  if (!pursuit) notFound()

  const selectedKind = typeof kind === 'string' ? kind : 'all'
  const [membership, stages, posts] = await Promise.all([
    myMembership(pursuit.id, userId),
    pursuitStages(pursuit.id),
    pursuitPosts(pursuit.id, selectedKind),
  ])

  // Replies and "useful" marks for everything on screen, in two queries rather
  // than two per post.
  const supabase = await supabaseServer()
  const postIds = posts.map((post) => post.id)
  const [{ data: replyRows }, { data: usefulRows }] = await Promise.all([
    postIds.length
      ? supabase
          .from('replies')
          .select('*, author:profiles!replies_author_id_fkey(*)')
          .in('post_id', postIds)
          .order('created_at')
      : Promise.resolve({ data: [] as never[] }),
    postIds.length
      ? supabase.from('post_useful').select('post_id').eq('user_id', userId).in('post_id', postIds)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const repliesByPost = new Map<string, (Reply & { author: Profile })[]>()
  for (const reply of (replyRows ?? []) as (Reply & { author: Profile })[]) {
    repliesByPost.set(reply.post_id, [...(repliesByPost.get(reply.post_id) ?? []), reply])
  }
  const markedUseful = new Set((usefulRows ?? []).map((row: { post_id: string }) => row.post_id))

  return (
    <div className="space-y-5">
      {membership ? (
        <Composer slug={slug} pursuitId={pursuit.id} stages={stages} profile={profile} />
      ) : null}

      <KindFilter slug={slug} selected={selectedKind} />

      {posts.length === 0 ? (
        <EmptyState
          icon="💬"
          title="Nothing here yet"
          body="Discussions are where the pursuit keeps what it learns. Ask a question, or write down what just worked."
        />
      ) : (
        <ul className="space-y-3">
          {posts.map((post) => {
            const replies = repliesByPost.get(post.id) ?? []
            return (
              <li key={post.id} className="card p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <Avatar profile={post.author} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[13px] font-semibold text-ink">
                        {post.author.full_name}
                      </span>
                      <span className="text-[11px] text-ink-faint">
                        {post.author.headline}
                      </span>
                      <span className="text-[11px] text-ink-faint">· {timeAgo(post.created_at)}</span>
                    </div>

                    <div className="mt-1.5">
                      <Chip tone={KIND_TONE[post.kind]}>{KIND_LABEL[post.kind]}</Chip>
                    </div>

                    {post.title ? (
                      <h3 className="mt-2.5 text-[15px] leading-snug font-semibold tracking-[-0.01em] text-ink">
                        {post.title}
                      </h3>
                    ) : null}

                    <div className="prose-commons mt-1.5">{post.body}</div>

                    <PostActions
                      slug={slug}
                      postId={post.id}
                      usefulCount={post.useful_count}
                      marked={markedUseful.has(post.id)}
                      replyCount={replies.length}
                    />

                    {replies.length > 0 ? (
                      <ul className="mt-3.5 space-y-3 border-l-2 border-line pl-4">
                        {replies.map((reply) => (
                          <li key={reply.id} className="flex items-start gap-2.5">
                            <Avatar profile={reply.author} size="xs" />
                            <div className="min-w-0">
                              <p className="text-[12px]">
                                <span className="font-semibold text-ink">
                                  {reply.author.full_name}
                                </span>
                                <span className="ml-1.5 text-ink-faint">
                                  {timeAgo(reply.created_at)}
                                </span>
                              </p>
                              <div className="prose-commons mt-0.5 text-[13px]">{reply.body}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {membership ? <ReplyForm slug={slug} postId={post.id} /> : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
