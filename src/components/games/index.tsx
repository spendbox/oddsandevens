"use client";

// Game registry: maps a game type to its component, loaded on demand so a
// player only ever downloads the one game they opened.
//
// Every lazy component is a module-level constant and `GameRenderer` switches
// between them, so no component value is ever created during a render.

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

const SpinWheel = dynamic(() => import("./spin-wheel"), { ssr: false, loading });
const ScratchCard = dynamic(() => import("./scratch-card"), { ssr: false, loading });
const MysteryBox = dynamic(() => import("./mystery-box"), { ssr: false, loading });
const AdventCalendar = dynamic(() => import("./advent-calendar"), { ssr: false, loading });
const EndlessRunner = dynamic(() => import("./endless-runner"), { ssr: false, loading });
const FallingCatcher = dynamic(() => import("./falling-catcher"), { ssr: false, loading });
const SliceNinja = dynamic(() => import("./slice-ninja"), { ssr: false, loading });
const TileMerge = dynamic(() => import("./tile-merge"), { ssr: false, loading });
const RecommenderQuiz = dynamic(() => import("./recommender-quiz"), { ssr: false, loading });
const MythFact = dynamic(() => import("./myth-fact"), { ssr: false, loading });
const MemoryMatch = dynamic(() => import("./memory-match"), { ssr: false, loading });
const Lookbook = dynamic(() => import("./lookbook"), { ssr: false, loading });
const LeaderboardTrivia = dynamic(() => import("./leaderboard-trivia"), { ssr: false, loading });
const ScavengerHunt = dynamic(() => import("./scavenger-hunt"), { ssr: false, loading });
const BracketPoll = dynamic(() => import("./bracket-poll"), { ssr: false, loading });
const WhackAMole = dynamic(() => import("./whack-a-mole"), { ssr: false, loading });
const Flappy = dynamic(() => import("./flappy"), { ssr: false, loading });
const Jigsaw = dynamic(() => import("./jigsaw"), { ssr: false, loading });
const SpotDifference = dynamic(() => import("./spot-difference"), { ssr: false, loading });
const TicTacToe = dynamic(() => import("./tic-tac-toe"), { ssr: false, loading });

export function GameRenderer({ type, ...props }: GameProps & { type: string }) {
  switch (type) {
    case "spin-wheel":
      return <SpinWheel {...props} />;
    case "scratch-card":
      return <ScratchCard {...props} />;
    case "mystery-box":
      return <MysteryBox {...props} />;
    case "advent-calendar":
      return <AdventCalendar {...props} />;
    case "endless-runner":
      return <EndlessRunner {...props} />;
    case "falling-catcher":
      return <FallingCatcher {...props} />;
    case "slice-ninja":
      return <SliceNinja {...props} />;
    case "tile-merge":
      return <TileMerge {...props} />;
    case "recommender-quiz":
      return <RecommenderQuiz {...props} />;
    case "myth-fact":
      return <MythFact {...props} />;
    case "memory-match":
      return <MemoryMatch {...props} />;
    case "lookbook":
      return <Lookbook {...props} />;
    case "leaderboard-trivia":
      return <LeaderboardTrivia {...props} />;
    case "scavenger-hunt":
      return <ScavengerHunt {...props} />;
    case "bracket-poll":
      return <BracketPoll {...props} />;
    case "whack-a-mole":
      return <WhackAMole {...props} />;
    case "flappy":
      return <Flappy {...props} />;
    case "jigsaw":
      return <Jigsaw {...props} />;
    case "spot-difference":
      return <SpotDifference {...props} />;
    case "tic-tac-toe":
      return <TicTacToe {...props} />;
    default:
      return (
        <p className="py-10 text-center text-sm text-zinc-500">
          This game type isn&apos;t available.
        </p>
      );
  }
}
