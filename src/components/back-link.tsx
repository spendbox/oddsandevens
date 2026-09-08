import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PendingDot } from './pending-dot'
import { cx } from './cx'

/**
 * The way back, in one place.
 *
 * There are five of these across the app and they were five separate copies of
 * the same three classes, which is how four of them ended up with no sign of
 * having been tapped. Going back is a page fetch like any other and has to say
 * so — see PendingDot.
 */
export function BackLink({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cx(
        'inline-flex items-center gap-1 text-sm text-dusk transition hover:text-mist active:scale-95',
        className,
      )}
    >
      <ChevronLeft size={15} /> {children}
      <PendingDot />
    </Link>
  )
}
