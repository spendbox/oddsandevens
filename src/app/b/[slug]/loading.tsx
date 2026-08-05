import { Boxy } from "@/components/art/boxy";

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
// `/b/*` begins, before any of that work has started. It is deliberately the
// same *shape* as the screen it precedes — road down the middle, rail across
// the top, buttons at the bottom — so the arrival is the scene filling in
// rather than one screen replacing another.
//
// No client component, no hooks, no data. It has to be the cheapest thing in
// the app or it is not instant, and everything moving here is CSS.

export default function Loading() {
  return (
    <main className="relative flex h-viewport flex-col overflow-hidden">
      {/* The ground. One gradient and one moving centre line — enough to read
          as the same world, far short of the real scene's cost. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(105deg, #1b1430, #241a3f)" }}
      />
      <div
        aria-hidden
        className="chase-carve absolute inset-y-0 left-1/2 w-[54%] sm:w-[58%]"
        style={{ background: "linear-gradient(100deg, #2a2140, #322747)" }}
      >
        <div
          className="chase-road absolute inset-y-0 left-1/2 w-[3%] -translate-x-1/2 opacity-70"
          style={{
            backgroundImage:
              "repeating-linear-gradient(180deg, #f4e2a8 0 70px, transparent 70px 240px)",
            backgroundSize: "100% 240px",
          }}
        />
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(8 5 15 / 0.72) 0%, transparent 22%, transparent 70%, rgb(8 5 15 / 0.78) 100%)",
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col justify-between gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* The rail, as the outline it is about to become. */}
        <div className="mx-auto w-full max-w-2xl shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <Bone className="size-9 shrink-0 rounded-full" />
            <Bone className="h-9 flex-1 rounded-full" />
            <Bone className="size-9 shrink-0 rounded-full" />
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <Bone className="h-7 w-16 rounded-full" />
            <Bone className="h-7 w-16 rounded-full" />
          </div>
        </div>

        {/* The mascot, on his way. He carries his own idle, so this is him
            rather than a spinner. */}
        <div className="flex flex-col items-center gap-3">
          <Boxy mood="thinking" className="size-28 drop-shadow-2xl" />
          <p className="text-sm font-black tracking-tight text-zinc-300">
            Rolling up to the safe…
          </p>
        </div>

        <div className="mx-auto w-full max-w-md shrink-0 space-y-2.5 px-1 pb-1">
          <Bone className="h-[3.75rem] w-full rounded-2xl" />
          <div className="grid grid-cols-2 gap-2.5">
            <Bone className="h-[2.75rem] rounded-2xl" />
            <Bone className="h-[2.75rem] rounded-2xl" />
          </div>
        </div>
      </div>
    </main>
  );
}

/** A piece of the layout that hasn't arrived yet. */
function Bone({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse border-2 border-white/10 bg-white/[0.06] ${className}`}
    />
  );
}
