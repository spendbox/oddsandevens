import { Boxy } from "@/components/art/boxy";
import { Sparkle } from "@/components/art/ink";

// The two seconds between tapping a safe and arriving at it.
//
// This page reads a box, a hunt, an attempt log and a price list out of
// Postgres before it can render anything, and on a phone on a bad connection
// that is a real wait — during which the old behaviour was for the front page
// to sit there, apparently ignoring the tap. A tap that appears to do nothing
// gets tapped again, which is the worst possible outcome: the second tap lands
// on a page that is already leaving.
//
// So this is `loading.tsx`, which Next streams the instant a navigation to
// `/b/*` begins, before any of that work has started.
//
// It used to be a wireframe of the screen it precedes — grey outlines where
// the rail and the buttons were going to be. That is a well-behaved skeleton
// and it was the wrong idea here: a grid of half-drawn bars says *unfinished*,
// and the last thing somebody should feel on the way into a game is that
// they've caught it with its trousers down. Waiting is the one moment with no
// information in it, so there is nothing to be honest about and nothing to
// lay out — which leaves being pleased to see them.
//
// One face, one warm light, one line. Nothing here is pretending to be
// anything else, and nothing is a placeholder for something better.
//
// No client component, no hooks, no data. It has to be the cheapest thing in
// the app or it is not instant, and everything moving here is CSS: Boxy's own
// idle bob, the breath of the glow, and four sparkles out of phase.

export default function Loading() {
  return (
    <main className="relative flex h-viewport flex-col items-center justify-center overflow-hidden px-6">
      {/* The room, lit from where he's standing. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(115% 85% at 50% 42%, #33255f 0%, #1d1535 52%, #100a20 100%)",
        }}
      />

      {/* The warm light he's standing in. Slow breath rather than a spin: a
          spinner counts the seconds, and this one has nothing to count. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[46%] size-[min(84vw,28rem)] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, rgb(255 194 71 / 0.34) 0%, transparent 66%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="relative">
          {/* Sparkles sit outside him, in their own layer, so his own art
              stays untouched at every size the mascot is used. The layer is
              inset outwards far enough that all four clear his arms — a
              sparkle touching the silhouette reads as a smudge on it. */}
          <svg
            aria-hidden
            viewBox="0 0 160 160"
            className="pointer-events-none absolute -inset-10"
          >
            <Sparkle x={14} y={44} size={7} color="#ffe08a" index={0} />
            <Sparkle x={146} y={56} size={9} color="#b57bff" index={1} />
            <Sparkle x={142} y={118} size={6} color="#4cc9f0" index={2} />
            <Sparkle x={11} y={114} size={8} color="#4ade9b" index={3} />
          </svg>

          <Boxy mood="happy" className="relative size-44 drop-shadow-2xl sm:size-52" />
        </div>

        <p className="text-center text-base font-black tracking-tight text-brass-bright">
          Rolling up to the safe…
        </p>
      </div>
    </main>
  );
}
