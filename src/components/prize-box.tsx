'use client'

import { naira } from '@/lib/money'

/**
 * The box itself, with the money in it.
 *
 * This replaces a line of text that said what the prize was. A sentence about
 * ₦100,000 is information; a box sitting there glowing, with coins drifting out
 * of it, is the reason somebody taps play. It is the loudest thing on the box
 * page and it should be.
 *
 * The lid is hinged at its back-left corner and tilted only a few degrees, so
 * it reads as a lid resting ajar on this box rather than a separate shape
 * floating near it. The amount sits underneath rather than across the ribbon,
 * because a number laid over a bow is a number nobody can read.
 *
 * Everything moves in CSS rather than JavaScript, so it costs one paint and
 * keeps running while the page is doing other work. `prefers-reduced-motion` is
 * honoured globally in globals.css, which flattens all of it to a still image.
 */
export function PrizeBox({
  amount,
  open = false,
  className,
}: {
  amount: number
  /** A beaten box stands open and empty. */
  open?: boolean
  className?: string
}) {
  return (
    <div className={`relative mx-auto w-full max-w-[17rem] ${className ?? ''}`}>
      {/* The glow behind it, breathing. */}
      <div
        aria-hidden
        className={
          'absolute inset-x-6 top-4 bottom-16 -z-10 rounded-full blur-3xl ' +
          (open ? 'bg-white/8' : 'animate-pulse-glow bg-gold/45')
        }
      />

      <svg
        viewBox="0 0 300 230"
        className={'w-full ' + (open ? '' : 'animate-float')}
        role="img"
        aria-label={open ? 'An opened, empty prize box' : `A prize box holding ${naira(amount)}`}
      >
        <defs>
          <linearGradient id="pb-body" x1="0" y1="0" x2="0.25" y2="1">
            <stop offset="0" stopColor="#a855f7" />
            <stop offset="1" stopColor="#5b1fb0" />
          </linearGradient>
          <linearGradient id="pb-lid" x1="0" y1="0" x2="0.25" y2="1">
            <stop offset="0" stopColor="#7de9fb" />
            <stop offset="1" stopColor="#0ea5c4" />
          </linearGradient>
          <linearGradient id="pb-gold" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor="#ffe9a8" />
            <stop offset="1" stopColor="#e8a615" />
          </linearGradient>
          <radialGradient id="pb-shine" cx="0.5" cy="1" r="0.75">
            <stop offset="0" stopColor="#ffe9a8" stopOpacity="0.85" />
            <stop offset="1" stopColor="#ffc94a" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ground shadow, so it is floating rather than adrift in space. */}
        <ellipse cx="150" cy="214" rx="72" ry="9" fill="#000000" opacity="0.4" />

        {/* Light and coins come out from behind the lid, never in front of it. */}
        {!open ? (
          <g>
            <path d="M88 118 L112 34 L188 34 L212 118 Z" fill="url(#pb-shine)" opacity="0.5" />
            <g fill="url(#pb-gold)">
              <g className="animate-float" style={{ animationDelay: '0ms' }}>
                <ellipse cx="112" cy="78" rx="12" ry="8" />
                <ellipse cx="112" cy="75" rx="12" ry="8" fill="#ffe9a8" opacity="0.85" />
              </g>
              <g className="animate-float" style={{ animationDelay: '1100ms' }}>
                <ellipse cx="152" cy="54" rx="14" ry="9.5" />
                <ellipse cx="152" cy="51" rx="14" ry="9.5" fill="#ffe9a8" opacity="0.85" />
              </g>
              <g className="animate-float" style={{ animationDelay: '2100ms' }}>
                <ellipse cx="192" cy="84" rx="11" ry="7.5" />
                <ellipse cx="192" cy="81" rx="11" ry="7.5" fill="#ffe9a8" opacity="0.85" />
              </g>
            </g>
          </g>
        ) : null}

        {/* Body */}
        <rect x="62" y="128" width="176" height="76" rx="14" fill="url(#pb-body)" />
        <rect x="62" y="128" width="176" height="8" rx="4" fill="#ffffff" opacity="0.16" />

        {/* Ribbon down the body, and the bow where the lid meets it. */}
        <rect x="139" y="128" width="22" height="76" fill="#ffc94a" opacity="0.92" />

        {/* Lid, hinged at its back-left corner so it stays touching the box. */}
        <g transform={open ? 'rotate(-26 70 126)' : 'rotate(-7 70 126)'}>
          <rect x="52" y="100" width="196" height="30" rx="11" fill="url(#pb-lid)" />
          <rect x="52" y="100" width="196" height="9" rx="4.5" fill="#ffffff" opacity="0.3" />
          <rect x="139" y="100" width="22" height="30" fill="#ffc94a" opacity="0.92" />
        </g>

        {/* Bow knot, drawn last so it sits on top of both ribbon runs. */}
        <circle cx="150" cy="140" r="15" fill="url(#pb-gold)" />
        <circle cx="150" cy="140" r="7" fill="#e8a615" opacity="0.6" />
      </svg>

      {/* The number, under the box where it can actually be read. */}
      <p className="prize tabular -mt-2 text-center text-4xl font-bold sm:text-5xl">
        {naira(amount)}
      </p>
    </div>
  )
}
