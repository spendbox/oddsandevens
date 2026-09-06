import { notFound } from 'next/navigation'
import Link from 'next/link'
import { EmptyState, SectionHeader } from '@/components/ui'
import {
  myMembership,
  pursuitBySlug,
  pursuitQuizzes,
  pursuitStages,
  pursuitTools,
} from '@/lib/queries'
import { requireOnboardedProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import type { CalculatorConfig, ChecklistConfig } from '@/lib/types'
import { QuizCard, QuizComposer, ToolComposer, ToolRunner } from './practice-ui'

export default async function Practice(props: PageProps<'/p/[slug]/practice'>) {
  const { slug } = await props.params
  const { userId } = await requireOnboardedProfile()

  const pursuit = await pursuitBySlug(slug)
  if (!pursuit) notFound()

  const [membership, stages, quizzes, tools] = await Promise.all([
    myMembership(pursuit.id, userId),
    pursuitStages(pursuit.id),
    pursuitQuizzes(pursuit.id),
    pursuitTools(pursuit.id),
  ])

  const supabase = await supabaseServer()
  const { data: attempts } = quizzes.length
    ? await supabase
        .from('quiz_attempts')
        .select('quiz_id, score, total')
        .eq('user_id', userId)
        .in(
          'quiz_id',
          quizzes.map((quiz) => quiz.id),
        )
    : { data: [] as never[] }

  const myAttempts = new Map(
    ((attempts ?? []) as { quiz_id: string; score: number; total: number }[]).map((attempt) => [
      attempt.quiz_id,
      attempt,
    ]),
  )

  return (
    <div className="space-y-9">
      <div className="card bg-mist p-4">
        <p className="text-[13px] leading-relaxed text-ink-soft">
          Quizzes and tools are how a pursuit turns what it knows into something you can actually
          use — and how a new member earns standing before they have anything to add to the
          knowledge base.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Tools</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Checklists and calculators built by members of this pursuit
            </p>
          </div>
        </div>

        {membership ? <ToolComposer slug={slug} pursuitId={pursuit.id} stages={stages} /> : null}

        {tools.length > 0 ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {tools.map((tool) => (
              <ToolRunner
                key={tool.id}
                slug={slug}
                tool={{
                  id: tool.id,
                  kind: tool.kind,
                  title: tool.title,
                  description: tool.description,
                  useCount: tool.use_count,
                  config: tool.config as ChecklistConfig & CalculatorConfig,
                  authorName: tool.author?.full_name ?? 'A member',
                }}
              />
            ))}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon="🛠️"
              title="No tools yet"
              body="A checklist of what has to be true before you move on, or a calculator for the sum everyone here works out by hand."
            />
          </div>
        )}
      </section>

      <section>
        <SectionHeader
          title="Quizzes"
          hint="Written by members, to check you actually have it"
        />

        {membership ? <QuizComposer slug={slug} pursuitId={pursuit.id} stages={stages} /> : null}

        {quizzes.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {quizzes.map((quiz) => (
              <li key={quiz.id}>
                <QuizCard
                  slug={slug}
                  quiz={{
                    id: quiz.id,
                    title: quiz.title,
                    description: quiz.description,
                    attemptCount: quiz.attempt_count,
                    questions: (quiz.questions ?? [])
                      .slice()
                      .sort((a, b) => a.position - b.position)
                      .map((question) => ({
                        id: question.id,
                        prompt: question.prompt,
                        options: question.options,
                        correctIndex: question.correct_index,
                        explanation: question.explanation,
                      })),
                  }}
                  author={quiz.author}
                  previous={myAttempts.get(quiz.id) ?? null}
                  canTake={Boolean(membership) && quiz.user_id !== userId}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon="🧠"
              title="No quizzes yet"
              body="Write one about the stage you just finished. The questions you wish someone had asked you are the good ones."
            />
          </div>
        )}
      </section>

      {!membership ? (
        <p className="text-center text-[13px] text-ink-muted">
          <Link href={`/p/${slug}`} className="font-medium text-accent hover:text-accent-hover">
            Join this pursuit
          </Link>{' '}
          to build tools and take quizzes.
        </p>
      ) : null}
    </div>
  )
}
