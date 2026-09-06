import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AssistantRunner } from '@/components/runners/assistant'
import { CalculatorRunner } from '@/components/runners/calculator'
import { DirectoryRunner } from '@/components/runners/directory'
import { GeneratorRunner } from '@/components/runners/generator'
import { QuizRunner } from '@/components/runners/quiz'
import { TrackerRunner } from '@/components/runners/tracker'
import { Logo } from '@/components/ui'
import {
  accent,
  parseSpec,
  type AssistantSpec,
  type CalculatorSpec,
  type DirectorySpec,
  type GeneratorSpec,
  type QuizSpec,
  type TrackerSpec,
} from '@/lib/engines'
import { optionalProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { formatPrice, type Tool, type ToolEntry, type ToolRecord } from '@/lib/types'
import { BuyButton } from './buy-button'

export const maxDuration = 120

export async function generateMetadata(props: PageProps<'/t/[slug]'>) {
  const { slug } = await props.params
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('tools')
    .select('title, tagline')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (!data) return { title: 'Tool not found' }
  return { title: data.title, description: data.tagline }
}

/**
 * The public face of a tool. This page is the product: it works for anyone with
 * the link, signed in or not, and says nothing about how it was made.
 */
export default async function ToolPage(props: PageProps<'/t/[slug]'>) {
  const { slug } = await props.params
  const supabase = await supabaseServer()
  const { userId } = await optionalProfile()

  const { data } = await supabase
    .from('tools')
    .select('*, owner:profiles(handle, full_name)')
    .eq('slug', slug)
    .maybeSingle()

  if (!data) notFound()
  const tool = data as unknown as Tool & { owner: { handle: string; full_name: string } | null }

  const isOwner = userId === tool.owner_id
  if (tool.status !== 'published' && !isOwner) notFound()

  const { data: allowed } = await supabase.rpc('has_access', { p_tool: tool.id })
  const hasAccess = Boolean(allowed)

  const [{ data: records }, { data: entries }] = await Promise.all([
    tool.engine === 'directory' && hasAccess
      ? supabase.from('tool_records').select('*').eq('tool_id', tool.id).order('position')
      : Promise.resolve({ data: [] as never[] }),
    tool.engine === 'tracker' && userId
      ? supabase
          .from('tool_entries')
          .select('*')
          .eq('tool_id', tool.id)
          .eq('user_id', userId)
          .order('entry_date', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as never[] }),
  ])

  if (tool.status === 'published') {
    await supabase.rpc('bump_view_count', { p_tool: tool.id })
  }

  const tone = accent(tool.accent)

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        {tool.status !== 'published' && isOwner ? (
          <div className="no-print mb-6 rounded-[10px] bg-warn-soft px-3.5 py-2.5 text-[12px] text-warn">
            This is a draft. Only you can see it.{' '}
            <Link href={`/build/${tool.id}`} className="font-medium underline">
              Back to editing
            </Link>
          </div>
        ) : null}

        <header className="mb-8">
          <div className="flex items-start gap-3.5">
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] text-2xl ${tone.bg}`}
            >
              {tool.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink sm:text-2xl">
                {tool.title}
              </h1>
              {tool.tagline ? (
                <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">{tool.tagline}</p>
              ) : null}
            </div>
          </div>

          {tool.description ? (
            <p className="mt-4 text-[14px] leading-relaxed whitespace-pre-line text-ink-soft">
              {tool.description}
            </p>
          ) : null}
        </header>

        {!hasAccess ? (
          <div className="card p-6 text-center">
            <p className="text-lg font-semibold text-ink">{formatPrice(tool.price_kobo, tool.currency)}</p>
            <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">
              {tool.owner?.full_name || 'The maker'} charges for this tool. Pay once and it is yours
              to use whenever you like.
            </p>
            <div className="mt-5">
              <BuyButton toolId={tool.id} slug={tool.slug} signedIn={Boolean(userId)} />
            </div>
          </div>
        ) : (
          <Runner
            tool={tool}
            records={(records ?? []) as ToolRecord[]}
            entries={(entries ?? []) as ToolEntry[]}
            signedIn={Boolean(userId)}
          />
        )}

        <footer className="no-print mt-12 border-t border-line pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-ink-faint">
              {tool.owner ? `Made by ${tool.owner.full_name || `@${tool.owner.handle}`}` : 'A Forge tool'}
            </p>
            <Link
              href="/"
              className="flex items-center gap-1.5 text-[12px] text-ink-faint transition-colors hover:text-ink-muted"
            >
              <Logo size={14} /> Built with Forge
            </Link>
          </div>
        </footer>
      </div>
    </main>
  )
}

function Runner({
  tool,
  records,
  entries,
  signedIn,
}: {
  tool: Tool
  records: ToolRecord[]
  entries: ToolEntry[]
  signedIn: boolean
}) {
  const unfinished = (
    <div className="card bg-mist p-6 text-center">
      <p className="text-sm font-semibold text-ink">This tool is not finished yet</p>
      <p className="mt-1.5 text-[13px] text-ink-muted">
        Its maker still has some work to do on it.
      </p>
    </div>
  )

  switch (tool.engine) {
    case 'calculator': {
      const spec = parseSpec<CalculatorSpec>('calculator', tool.spec)
      return spec ? <CalculatorRunner spec={spec} /> : unfinished
    }
    case 'quiz': {
      const spec = parseSpec<QuizSpec>('quiz', tool.spec)
      return spec ? <QuizRunner spec={spec} /> : unfinished
    }
    case 'generator': {
      const spec = parseSpec<GeneratorSpec>('generator', tool.spec)
      return spec ? <GeneratorRunner spec={spec} toolId={tool.id} canRun /> : unfinished
    }
    case 'tracker': {
      const spec = parseSpec<TrackerSpec>('tracker', tool.spec)
      return spec ? (
        <TrackerRunner
          spec={spec}
          toolId={tool.id}
          slug={tool.slug}
          entries={entries}
          signedIn={signedIn}
        />
      ) : (
        unfinished
      )
    }
    case 'directory': {
      const spec = parseSpec<DirectorySpec>('directory', tool.spec)
      return spec ? <DirectoryRunner spec={spec} records={records} /> : unfinished
    }
    case 'assistant': {
      const spec = parseSpec<AssistantSpec>('assistant', tool.spec)
      return spec ? <AssistantRunner spec={spec} toolId={tool.id} /> : unfinished
    }
    default:
      return unfinished
  }
}
