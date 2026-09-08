'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * A row of cards you swipe through.
 *
 * Built on CSS scroll-snap rather than a carousel library, which means the
 * native gesture does the work: momentum, rubber-banding at the ends and
 * accessibility all come from the browser, and it degrades to an ordinary
 * scrolling row if the JavaScript never arrives.
 *
 * The dots and arrows are steering, not state — the scroll position is the
 * source of truth, read back on scroll rather than tracked separately, so a
 * flick and an arrow press can never disagree about which card is showing.
 */
export function CardDeck({
  children,
  label,
}: {
  children: ReactNode[]
  label: string
}) {
  const rail = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)

  const goTo = (index: number) => {
    const node = rail.current
    if (!node) return

    const card = node.children[index] as HTMLElement | undefined
    if (!card) return

    node.scrollTo({
      left: card.offsetLeft - (node.clientWidth - card.clientWidth) / 2,
      behavior: 'smooth',
    })
  }

  /** Which card is nearest the middle of the rail right now. */
  const onScroll = () => {
    const node = rail.current
    if (!node) return

    const middle = node.scrollLeft + node.clientWidth / 2
    let nearest = 0
    let best = Infinity

    Array.from(node.children).forEach((child, index) => {
      const card = child as HTMLElement
      const centre = card.offsetLeft + card.clientWidth / 2
      const distance = Math.abs(centre - middle)
      if (distance < best) {
        best = distance
        nearest = index
      }
    })

    setCurrent(nearest)
  }

  const count = children.length

  return (
    <div>
      <div
        ref={rail}
        onScroll={onScroll}
        className="deck px-4 sm:px-0"
        role="group"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') goTo(Math.min(current + 1, count - 1))
          if (event.key === 'ArrowLeft') goTo(Math.max(current - 1, 0))
        }}
      >
        {children.map((child, index) => (
          <div
            key={index}
            className="animate-deal-in"
            style={{ animationDelay: `${Math.min(index, 4) * 70}ms` }}
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}`}
          >
            {child}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 px-4">
        <button
          type="button"
          onClick={() => goTo(Math.max(current - 1, 0))}
          disabled={current === 0}
          aria-label="Previous card"
          className="grid size-9 place-items-center rounded-full bg-white/6 text-mist transition
                     active:scale-90 active:bg-white/14 disabled:opacity-25"
        >
          <ChevronLeft size={17} />
        </button>

        <div className="flex items-center gap-1.5">
          {children.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Go to card ${index + 1}`}
              aria-current={index === current}
              className={
                'h-2 rounded-full transition-all ' +
                (index === current ? 'w-6 bg-gold' : 'w-2 bg-white/20 hover:bg-white/40')
              }
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => goTo(Math.min(current + 1, count - 1))}
          disabled={current === count - 1}
          aria-label="Next card"
          className="grid size-9 place-items-center rounded-full bg-white/6 text-mist transition
                     active:scale-90 active:bg-white/14 disabled:opacity-25"
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  )
}
