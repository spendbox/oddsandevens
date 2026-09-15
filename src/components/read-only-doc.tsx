import { cellKey, colName, computeGrid } from '@/lib/formula'
import { highlight } from '@/lib/highlight'
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
const CODE_COLOURS: Record<string, string> = {
  comment: 'text-[var(--color-faint)] italic',
  string: 'text-[var(--color-good)]',
  number: 'text-[var(--color-accent)]',
  keyword: 'text-[var(--color-accent)] font-medium',
  tag: 'text-[var(--color-accent)]',
  punct: '',
  plain: '',
}

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

    case 'table': {
      // Formulas are computed here, on the server, so the reader sees answers
      // without downloading an engine to work them out.
      const computed = computeGrid(block.cells)
      return (
        <div className="my-3 overflow-x-auto rounded-lg border border-[var(--color-line)]">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-9 border-r border-b border-[var(--color-line)] bg-[var(--color-hover)]" />
                {Array.from({ length: block.cols }, (_, c) => (
                  <th
                    key={c}
                    className="border-r border-b border-[var(--color-line)] bg-[var(--color-hover)] px-2 py-1 text-[11px] font-medium text-[var(--color-muted)] last:border-r-0"
                  >
                    {colName(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: block.rows }, (_, r) => (
                <tr key={r}>
                  <th className="border-r border-b border-[var(--color-line)] bg-[var(--color-hover)] text-center text-[11px] font-normal text-[var(--color-faint)]">
                    {r + 1}
                  </th>
                  {Array.from({ length: block.cols }, (_, c) => {
                    const result = computed[cellKey(c, r)]
                    return (
                      <td
                        key={c}
                        className={`border-r border-b border-[var(--color-line)] px-2 py-1.5 tabular-nums last:border-r-0 ${
                          result?.error
                            ? 'text-[var(--color-danger)]'
                            : result?.numeric
                              ? 'text-right'
                              : ''
                        }`}
                      >
                        {result?.text ?? ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case 'code':
      return (
        <pre className="my-3 overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] p-3 font-mono text-[13px] leading-[1.6]">
          {highlight(block.code, block.lang).map((token, i) => (
            <span key={i} className={CODE_COLOURS[token.kind] ?? ''}>
              {token.text}
            </span>
          ))}
        </pre>
      )

    case 'form':
      return (
        <div className="my-3 rounded-lg border border-[var(--color-line)] p-3">
          <p className="text-sm font-medium">{block.title || 'Form'}</p>
          <ul className="mt-2 space-y-1">
            {block.fields.map((field) => (
              <li key={field.id} className="text-xs text-[var(--color-muted)]">
                {field.label || 'Untitled question'}
                {field.required && <span className="text-[var(--color-danger)]"> *</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-[var(--color-faint)]">
            Answering a shared form is not possible yet.
          </p>
        </div>
      )

    case 'file':
      return (
        <p className="my-2 rounded-lg border border-dashed border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-faint)]">
          {block.name || 'Attachment'} — attachments stay on the device they were
          added to, so this one is not part of the shared copy.
        </p>
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
