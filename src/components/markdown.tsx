import { Fragment, type ReactNode } from 'react'

/**
 * A small Markdown renderer for generated documents and assistant replies.
 *
 * It builds React elements rather than an HTML string, so nothing a model or a
 * creator writes can inject markup — there is no dangerouslySetInnerHTML here
 * and there should never be one. It handles the subset those two actually
 * produce: headings, paragraphs, lists, tables, rules, bold, italic and code.
 */

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let match: RegExpExecArray | null
  let index = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${index++}`

    if (token.startsWith('**')) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`')) nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    else nodes.push(<em key={key}>{token.slice(1, -1)}</em>)

    last = match.index + token.length
  }

  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

const splitRow = (line: string) =>
  line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim())

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i += 1
      continue
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${i}`} />)
      i += 1
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = Math.min(heading[1].length, 3)
      const content = inline(heading[2], `h-${i}`)
      blocks.push(
        level === 1 ? (
          <h1 key={`h-${i}`}>{content}</h1>
        ) : level === 2 ? (
          <h2 key={`h-${i}`}>{content}</h2>
        ) : (
          <h3 key={`h-${i}`}>{content}</h3>
        ),
      )
      i += 1
      continue
    }

    // A table needs a header row and the dashed separator under it.
    if (line.includes('|') && /^[\s|:-]+$/.test(lines[i + 1] ?? '') && (lines[i + 1] ?? '').includes('-')) {
      const header = splitRow(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]))
        i += 1
      }
      blocks.push(
        <div key={`table-${i}`} className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {header.map((cell, index) => (
                  <th key={index}>{inline(cell, `th-${i}-${index}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{inline(cell, `td-${rowIndex}-${cellIndex}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i += 1
      }
      blocks.push(
        <ul key={`ul-${i}`}>
          {items.map((item, index) => (
            <li key={index}>{inline(item, `li-${i}-${index}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
        i += 1
      }
      blocks.push(
        <ol key={`ol-${i}`}>
          {items.map((item, index) => (
            <li key={index}>{inline(item, `oli-${i}-${index}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    // Everything else is a paragraph, running until a blank line.
    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i])) {
      paragraph.push(lines[i].trim())
      i += 1
    }
    blocks.push(
      <p key={`p-${i}`}>
        {paragraph.map((part, index) => (
          <Fragment key={index}>
            {index > 0 ? ' ' : null}
            {inline(part, `p-${i}-${index}`)}
          </Fragment>
        ))}
      </p>,
    )
  }

  return <div className="prose-forge">{blocks}</div>
}

/** Fill {{placeholders}} in a template from a set of answers. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => values[key] ?? '')
}
