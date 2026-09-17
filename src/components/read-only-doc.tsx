import { blockHtml } from '@/lib/rich-text'
import type { Block } from '@/lib/types'

/**
 * A document rendered for reading, not editing.
 *
 * A server component on purpose: a shared link is most often opened by someone
 * who has never heard of this app, on a phone, on a bad connection. They get
 * HTML. None of the editor, the formula engine's interactivity, the slash menu
 * or the sync client is sent to them, because none of it does anything on a
 * page you cannot edit.
 */

export default function ReadOnlyDoc({ title, blocks }: { title: string; blocks: Block[] }) {
  return (
    <article className="pad-prose">
      <h1 className="mb-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title.trim() || 'Untitled'}
      </h1>
      {blocks.map((block) => (
        <ReadOnlyBlock key={block.id} block={block} />
      ))}
    </article>
  )
}

function ReadOnlyBlock({ block }: { block: Block }) {
  switch (block.type) {
    case 'divider':
      return <hr className="my-6 border-0 border-t border-[var(--color-line)]" />

    case 'heading': {
      const level = block.level ?? 1
      const className =
        level === 1
          ? 'text-2xl font-semibold tracking-tight mt-6 mb-1'
          : level === 2
            ? 'text-xl font-semibold tracking-tight mt-5 mb-0.5'
            : 'text-base font-semibold mt-4'
      // The HTML is sanitised by blockHtml on the way in; see lib/rich-text.ts.
      const Tag = (level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4') as 'h2'
      return <Tag className={className} dangerouslySetInnerHTML={{ __html: blockHtml(block) }} />
    }

    case 'bullet':
      return (
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-[0.72rem] h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--color-muted)]"
          />
          <p
            className="min-w-0 flex-1 py-0.5 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: blockHtml(block) }}
          />
        </div>
      )

    case 'quote':
      return (
        <blockquote
          className="my-2 border-l-2 border-[var(--color-line)] pl-3 leading-relaxed text-[var(--color-muted)] italic"
          dangerouslySetInnerHTML={{ __html: blockHtml(block) }}
        />
      )

    case 'todo':
      return (
        <div className="flex items-start gap-2 py-0.5">
          <span
            aria-hidden
            className={`mt-[0.3rem] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded border text-[10px] ${
              block.done
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                : 'border-[var(--color-line)]'
            }`}
          >
            {block.done ? '✓' : ''}
          </span>
          <p
            className={`min-w-0 flex-1 py-0.5 leading-relaxed ${
              block.done ? 'text-[var(--color-faint)] line-through' : ''
            }`}
            dangerouslySetInnerHTML={{ __html: blockHtml(block) }}
          />
        </div>
      )

    default:
      return (
        <p
          className="py-1 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: blockHtml(block) }}
        />
      )
  }
}
