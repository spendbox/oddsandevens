import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteHeader } from '@/components/site-header'
import { AssistantRunner } from '@/components/runners/assistant'
import { CalculatorRunner } from '@/components/runners/calculator'
import { DirectoryRunner } from '@/components/runners/directory'
import { GeneratorRunner } from '@/components/runners/generator'
import { QuizRunner } from '@/components/runners/quiz'
import { Chip } from '@/components/ui'
import {
  ENGINES,
  accent,
  parseSpec,
  type AssistantSpec,
  type CalculatorSpec,
  type DirectorySpec,
  type GeneratorSpec,
  type QuizSpec,
} from '@/lib/engines'
import { requireProfile } from '@/lib/session'
import { supabaseServer } from '@/lib/supabase/server'
import { formatPrice, type Tool, type ToolRecord } from '@/lib/types'
import { AskForChange } from './ask-for-change'
import { Building } from './building'
import { DetailsForm } from './details-form'
import { PublishBar } from './publish-bar'
import { RecordsEditor } from './records-editor'
import { SpecEditor } from './spec-editor'

// Building a tool is two Claude calls with thinking, so this route needs room.
export const maxDuration = 300

export const metadata = { title: 'Edit tool' }

export default async function BuildPage(props: PageProps<'/build/[id]'>) {
  const { id } = await props.params
  const { userId } = await requireProfile()
  const supabase = await supabaseServer()

  const { data } = await supabase.from('tools').select('*').eq('id', id).maybeSingle()
  if (!data || data.owner_id !== userId) notFound()

  const tool = data as Tool
  const built = tool.spec && Object.keys(tool.spec as object).length > 0

  if (!built) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:py-16">
          <h1 className="mb-6 text-xl font-semibold tracking-[-0.02em] text-ink">
            Building your tool
          </h1>
          <Building toolId={tool.id} brief={tool.brief} />
        </main>
      </>
    )
  }

  const engine = ENGINES[tool.engine]
  const tone = accent(tool.accent)
  const runs = parseSpec(tool.engine, tool.spec)

  const { data: records } =
    tool.engine === 'directory'
      ? await supabase.from('tool_records').select('*').eq('tool_id', tool.id).order('position')
      : { data: [] as never[] }

  return (
    <>
      <SiteHeader />
      <PublishBar tool={tool} runnable={Boolean(runs)} />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-5">
          {/* What the person you send the link to will see. */}
          <section className="order-2 min-w-0 lg:order-1 lg:col-span-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-medium text-ink-muted">Preview</h2>
              {tool.status === 'published' ? (
                <Link
                  href={`/t/${tool.slug}`}
                  className="text-[12px] font-medium text-accent hover:text-accent-hover"
                >
                  Open the live tool →
                </Link>
              ) : null}
            </div>

            <div className="card p-5 sm:p-7">
              <div className="mb-6 flex items-start gap-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-xl ${tone.bg}`}
                >
                  {tool.emoji}
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold tracking-[-0.02em] text-ink">{tool.title}</h3>
                  {tool.tagline ? (
                    <p className="mt-0.5 text-[13px] text-ink-muted">{tool.tagline}</p>
                  ) : null}
                </div>
              </div>

              {runs ? (
                <Preview tool={tool} records={(records ?? []) as ToolRecord[]} />
              ) : (
                <div className="rounded-[10px] bg-warn-soft px-4 py-3.5 text-[13px] leading-relaxed text-warn">
                  This tool cannot run as it stands — something in it is missing or the wrong shape.
                  Ask for a change below, or fix it under &ldquo;The tool itself&rdquo;.
                </div>
              )}
            </div>
          </section>

          {/* Everything that changes it. */}
          <aside className="order-1 min-w-0 space-y-6 lg:order-2 lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="accent">
                {engine.emoji} {engine.name}
              </Chip>
              <Chip tone={tool.status === 'published' ? 'lift' : 'neutral'}>
                {tool.status === 'published' ? 'Published' : 'Draft'}
              </Chip>
              <Chip>{formatPrice(tool.price_kobo, tool.currency)}</Chip>
            </div>

            <AskForChange toolId={tool.id} engineName={engine.name.toLowerCase()} />

            <details className="card overflow-hidden" open>
              <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-ink hover:bg-mist">
                Name, price and appearance
              </summary>
              <div className="border-t border-line p-4">
                <DetailsForm tool={tool} />
              </div>
            </details>

            {tool.engine === 'directory' ? (
              <details className="card overflow-hidden" open>
                <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-ink hover:bg-mist">
                  Listings ({(records ?? []).length})
                </summary>
                <div className="border-t border-line p-4">
                  <RecordsEditor
                    toolId={tool.id}
                    spec={parseSpec<DirectorySpec>('directory', tool.spec)}
                    records={(records ?? []) as ToolRecord[]}
                  />
                </div>
              </details>
            ) : null}

            <details className="card overflow-hidden">
              <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium text-ink hover:bg-mist">
                The tool itself
              </summary>
              <div className="border-t border-line p-4">
                <p className="mb-4 text-[12px] leading-relaxed text-ink-faint">
                  Every part of the tool, as it was built. Most changes are easier to ask for above,
                  but everything can be edited by hand here.
                </p>
                <SpecEditor toolId={tool.id} spec={tool.spec} />
              </div>
            </details>
          </aside>
        </div>
      </main>
    </>
  )
}

function Preview({ tool, records }: { tool: Tool; records: ToolRecord[] }) {
  switch (tool.engine) {
    case 'calculator': {
      const spec = parseSpec<CalculatorSpec>('calculator', tool.spec)
      return spec ? <CalculatorRunner spec={spec} /> : null
    }
    case 'quiz': {
      const spec = parseSpec<QuizSpec>('quiz', tool.spec)
      return spec ? <QuizRunner spec={spec} /> : null
    }
    case 'generator': {
      const spec = parseSpec<GeneratorSpec>('generator', tool.spec)
      return spec ? <GeneratorRunner spec={spec} toolId={tool.id} canRun={false} /> : null
    }
    case 'directory': {
      const spec = parseSpec<DirectorySpec>('directory', tool.spec)
      return spec ? <DirectoryRunner spec={spec} records={records} /> : null
    }
    case 'assistant': {
      const spec = parseSpec<AssistantSpec>('assistant', tool.spec)
      return spec ? <AssistantRunner spec={spec} toolId={tool.id} /> : null
    }
    case 'tracker':
      return (
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Trackers keep entries against the account using them, so there is nothing to preview here.
          Publish it and open the link to try it yourself.
        </p>
      )
    default:
      return null
  }
}
