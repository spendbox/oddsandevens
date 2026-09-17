'use client'

/**
 * A passage with the matched words picked out.
 *
 * Built from offsets rather than by replacing text, because the snippet is
 * somebody's own writing: anything that goes near it with a regular expression
 * and string concatenation is one step away from putting markup into it.
 *
 * Shared by the search panel and the Library so both look identical — which is
 * the point, since both are the same search. A result that shows the sentence
 * it matched is how somebody knows the box reads inside notes rather than
 * filtering a list of names.
 *
 * Yellow, and the only yellow in the app: a highlighter is what people use on
 * paper for exactly this, and it is the one colour that cannot be confused
 * with the green that says what kind of note something is.
 */
export default function Snippet({
  text,
  highlights,
}: {
  text: string
  highlights: Array<[number, number]>
}) {
  const parts: React.ReactNode[] = []
  let at = 0
  for (const [start, end] of highlights) {
    if (start > at) parts.push(text.slice(at, start))
    parts.push(
      <mark key={start} className="pad-mark">
        {text.slice(start, end)}
      </mark>,
    )
    at = end
  }
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}
