import Link from 'next/link'
import { PendingDot } from '@/components/pending-dot'
import { Card } from '@/components/ui'

/**
 * One number, on a card.
 *
 * Lives here rather than in each admin page because there are now three of them
 * showing the same kind of tile, and a dashboard where the money reads at one
 * size and the takings at another looks like two different screens.
 *
 * `href` turns the tile into a link, and when it is one it says so on tap —
 * every number on these pages is a page fetch away from the detail behind it.
 */
export function Stat({
  label,
  value,
  tone,
  href,
  hint,
}: {
  label: string
  value: string
  tone: 'violet' | 'cyan' | 'lime' | 'gold' | 'rose' | 'quiet'
  href?: string
  hint?: string
}) {
  const tones = {
    violet: 'text-violet-soft',
    cyan: 'text-cyan',
    lime: 'text-lime',
    gold: 'text-gold',
    rose: 'text-rose',
    quiet: 'text-mist',
  }

  const body = (
    <Card className={href ? 'h-full transition hover:border-violet/45' : 'h-full'}>
      <p className="text-xs font-semibold tracking-wider text-dusk uppercase">
        {label}
        {href ? <PendingDot /> : null}
      </p>
      <p className={`tabular mt-1.5 text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-dusk">{hint}</p> : null}
    </Card>
  )

  return href ? <Link href={href}>{body}</Link> : body
}
