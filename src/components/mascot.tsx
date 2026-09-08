/**
 * Boxy, the Spendbox mascot.
 *
 * A little treasure box with a face. Drawn as inline SVG rather than shipped as
 * an image so it inherits the page's colours, scales without blurring on any
 * screen, and costs no extra request on a phone connection.
 *
 * Five moods, used in the places where the app would otherwise be silent: an
 * empty dashboard, a missed level, a screen that is loading, a win. A product
 * about tapping tiles for money is friendlier with something in it that looks
 * back at you.
 */
export type Mood = 'happy' | 'excited' | 'sad' | 'thinking' | 'sleeping'

/**
 * How each mood moves. Small amounts: the point is that Boxy looks alive, not
 * that it demands attention while somebody is trying to read the page behind it.
 */
const MOTION: Record<Mood, string> = {
  happy: 'animate-boxy-bob',
  excited: 'animate-boxy-jump',
  sad: 'animate-boxy-sway',
  thinking: 'animate-boxy-sway',
  sleeping: 'animate-boxy-breathe',
}

export function Mascot({
  mood = 'happy',
  size = 120,
  animate = true,
  className,
}: {
  mood?: Mood
  size?: number
  /** Turn the movement off where a still drawing reads better. */
  animate?: boolean
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      className={[animate ? MOTION[mood] : '', className].filter(Boolean).join(' ')}
      role="img"
      aria-label="Boxy, the Spendbox mascot"
    >
      <defs>
        <linearGradient id="boxy-body" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#c084fc" />
          <stop offset="1" stopColor="#7c2fe0" />
        </linearGradient>
        <linearGradient id="boxy-lid" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#67e8f9" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <radialGradient id="boxy-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#a855f7" stopOpacity="0.5" />
          <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="60" cy="62" rx="52" ry="50" fill="url(#boxy-glow)" />

      {/* The lid tips back when Boxy is excited, as if something is coming out. */}
      <g
        transform={mood === 'excited' ? 'rotate(-13 30 40)' : undefined}
        className={animate && mood === 'excited' ? 'animate-boxy-lid' : undefined}
        style={{ transformOrigin: '30px 40px' }}
      >
        <rect x="20" y="30" width="80" height="20" rx="8" fill="url(#boxy-lid)" />
        <rect x="53" y="30" width="14" height="20" fill="#0ea5c4" opacity="0.55" />
      </g>

      {/* Body */}
      <rect x="24" y="50" width="72" height="52" rx="12" fill="url(#boxy-body)" />
      <rect x="53" y="50" width="14" height="52" fill="#5b1fb0" opacity="0.35" />

      {/* Face */}
      <g fill="#1a0b33">
        {mood === 'sleeping' ? (
          <>
            <path d="M38 68q5 5 10 0" stroke="#1a0b33" strokeWidth="3.5" strokeLinecap="round" fill="none" />
            <path d="M72 68q5 5 10 0" stroke="#1a0b33" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          </>
        ) : mood === 'sad' ? (
          <>
            <circle cx="43" cy="70" r="5" />
            <circle cx="77" cy="70" r="5" />
          </>
        ) : (
          <>
            <ellipse
              cx="43"
              cy="70"
              rx="5.5"
              ry={mood === 'excited' ? 7 : 6}
              className={animate ? 'animate-boxy-blink' : undefined}
              style={{ transformOrigin: '43px 70px' }}
            />
            <ellipse
              cx="77"
              cy="70"
              rx="5.5"
              ry={mood === 'excited' ? 7 : 6}
              className={animate ? 'animate-boxy-blink' : undefined}
              style={{ transformOrigin: '77px 70px' }}
            />
            {/* A highlight in each eye is most of what makes it read as cute. */}
            <circle cx="45" cy="68" r="2" fill="#ffffff" />
            <circle cx="79" cy="68" r="2" fill="#ffffff" />
          </>
        )}
      </g>

      {/* Mouth */}
      {mood === 'sad' ? (
        <path
          d="M50 88q10 -8 20 0"
          stroke="#1a0b33"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
      ) : mood === 'excited' ? (
        <ellipse cx="60" cy="87" rx="8" ry="9" fill="#1a0b33" />
      ) : mood === 'sleeping' ? (
        <ellipse cx="60" cy="87" rx="5" ry="4" fill="#1a0b33" opacity="0.7" />
      ) : (
        <path
          d="M50 84q10 9 20 0"
          stroke="#1a0b33"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
      )}

      {/* Cheeks */}
      <ellipse cx="33" cy="82" rx="5" ry="3.5" fill="#fb7185" opacity="0.55" />
      <ellipse cx="87" cy="82" rx="5" ry="3.5" fill="#fb7185" opacity="0.55" />

      {mood === 'thinking' ? (
        <g fill="#c99cff">
          <circle cx="100" cy="40" r="3" opacity="0.9" />
          <circle cx="108" cy="30" r="4.5" opacity="0.7" />
        </g>
      ) : null}

      {mood === 'sleeping' ? (
        <g fill="#c99cff" fontSize="13" fontWeight="700" fontFamily="system-ui, sans-serif">
          <text x="96" y="40">z</text>
          <text x="105" y="28">z</text>
        </g>
      ) : null}

      {mood === 'excited' ? (
        <g fill="#ffc94a">
          <circle cx="26" cy="24" r="3" />
          <circle cx="96" cy="20" r="4" />
          <circle cx="108" cy="46" r="2.5" />
        </g>
      ) : null}
    </svg>
  )
}
