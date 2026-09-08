'use client'

import { useState } from 'react'

/**
 * Attempts on your box, day by day.
 *
 * A column chart, because the data is a count per discrete day — not a
 * continuous measurement, which is what a line would imply.
 *
 * One series, so: no legend (the heading names it), and every bar the same
 * colour. Colouring bars darker-where-taller is tempting and wrong — it spends
 * the only free channel on information the bar height already carries, and it
 * makes days look categorically different when they are not.
 *
 * The violet is the brand accent, checked against this surface rather than
 * chosen by eye: cyan failed the lightness band on a dark ground.
 */
export type DayCount = { day: string; count: number }

export function AttemptsChart({ data }: { data: DayCount[] }) {
  const [hovered, setHovered] = useState<number | null>(null)

  const total = data.reduce((sum, point) => sum + point.count, 0)
  const peak = Math.max(1, ...data.map((point) => point.count))
  const busiest = data.reduce((best, point) => (point.count > best.count ? point : best), data[0])

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/12 px-5 py-8 text-center">
        <p className="text-sm font-medium text-mist">Nobody has played it yet</p>
        <p className="mt-1 text-xs text-dusk">
          Share your link and attempts will show up here, day by day.
        </p>
      </div>
    )
  }

  return (
    <figure>
      <figcaption className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <p className="tabular text-2xl font-bold">{total}</p>
          <p className="text-xs text-mist">
            {total === 1 ? 'attempt' : 'attempts'} in the last {data.length} days
          </p>
        </div>
        {busiest && busiest.count > 0 ? (
          <p className="text-right text-xs text-dusk">
            Busiest: <span className="text-mist">{label(busiest.day)}</span> ·{' '}
            <span className="tabular text-mist">{busiest.count}</span>
          </p>
        ) : null}
      </figcaption>

      {/* The plot. Hairline baseline only — no gridlines competing with 14 thin
          bars in a space this small. */}
      <div
        className="relative flex h-32 items-end gap-[3px] border-b border-white/10"
        onPointerLeave={() => setHovered(null)}
      >
        {data.map((point, index) => {
          const height = point.count === 0 ? 0 : Math.max(4, (point.count / peak) * 100)
          const active = hovered === index

          return (
            <div
              key={point.day}
              className="group relative flex h-full flex-1 items-end"
              onPointerEnter={() => setHovered(index)}
            >
              {/* A full-height hit target, so a 4px bar is still easy to hover. */}
              <span className="absolute inset-0" aria-hidden />

              <div
                className={
                  'w-full rounded-t-[4px] transition-[background-color,height] duration-150 ' +
                  (point.count === 0
                    ? 'bg-white/8'
                    : active
                      ? 'bg-violet-soft'
                      : 'bg-violet')
                }
                style={{ height: `${height}%` }}
              />

              {active && point.count > 0 ? (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-xl bg-ink px-2.5 py-1.5 text-center whitespace-nowrap ring-1 ring-white/15">
                  <p className="tabular text-sm font-semibold">{point.count}</p>
                  <p className="text-[11px] text-dusk">{label(point.day)}</p>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-dusk">
        <span>{label(data[0].day)}</span>
        <span>{label(data[data.length - 1].day)}</span>
      </div>

      {/* The same numbers as text, for anyone who cannot use the hover. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-dusk hover:text-mist">
          Show as a table
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-left text-dusk">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Attempts</th>
            </tr>
          </thead>
          <tbody className="text-mist">
            {data.map((point) => (
              <tr key={point.day} className="border-t border-white/6">
                <td className="py-1">{label(point.day)}</td>
                <td className="tabular py-1 text-right">{point.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

function label(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
  })
}
