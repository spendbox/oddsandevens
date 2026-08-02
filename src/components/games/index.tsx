"use client";

// Game registry: maps a game type to its component, loaded on demand so a
// player only ever downloads the one game they opened.
//
// Every lazy component is a module-level constant and `GameRenderer` switches
// between them, so no component value is ever created during a render.
//
// Five games. Each was kept because it produces a score with enough spread to
// rank a weekly board honestly — a game where everyone competent finishes on
// the same number is a game the leaderboard can't rank, so it isn't here.

import dynamic from "next/dynamic";
import type { GameProps } from "./kit";

const loading = () => (
  <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
    <span className="animate-pulse">Loading game…</span>
  </div>
);

// ssr: false — every game is a pointer/animation experience with nothing
// useful to prerender, and skipping SSR keeps the first paint to the shell.
// The options object has to be written out at each call: Next statically
// analyses it, so a shared constant is rejected at build time.

const SliceNinja = dynamic(() => import("./slice-ninja"), { ssr: false, loading });
const WhackAMole = dynamic(() => import("./whack-a-mole"), { ssr: false, loading });
const Flappy = dynamic(() => import("./flappy"), { ssr: false, loading });
const Mahjong3D = dynamic(() => import("./mahjong-3d"), { ssr: false, loading });
const MatchThree = dynamic(() => import("./match-3"), { ssr: false, loading });

export function GameRenderer({ type, ...props }: GameProps & { type: string }) {
  switch (type) {
    case "slice-ninja":
      return <SliceNinja {...props} />;
    case "whack-a-mole":
      return <WhackAMole {...props} />;
    case "flappy":
      return <Flappy {...props} />;
    case "mahjong-3d":
      return <Mahjong3D {...props} />;
    case "match-3":
      return <MatchThree {...props} />;
    default:
      // A retired game type: a business's old link still resolves, and the
      // player gets a sentence rather than an empty panel.
      return (
        <p className="py-10 text-center text-sm text-zinc-500">
          This game has finished — try the others from this business.
        </p>
      );
  }
}
