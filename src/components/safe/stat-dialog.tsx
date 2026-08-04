"use client";

// What a number on the rail means, when somebody asks.
//
// The three figures across the top of the scene used to carry captions —
// "HUNTERS", "ATTEMPTS", "BEST YET" — in 9px capitals, on the screen with the
// least room for words on the whole site. Three words of chrome explaining
// three numbers nobody had asked about yet.
//
// The numbers are an icon and a figure now, and this is what a tap gets you:
// the name, the sentence, and — the reason it is worth a dialog rather than a
// tooltip — what the number is *for*. "The closest anybody has come" is a fact.
// "Somebody got within eight points of this password and it is still shut" is a
// reason to keep going.

import { Swords, Trophy, Users } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { StatKind } from "./scene-hud";
import type { PublicBox } from "@/lib/types";

export function StatDialog({
  stat,
  box,
  yourBest,
  onClose,
}: {
  stat: StatKind;
  box: PublicBox;
  yourBest: number | null;
  onClose: () => void;
}) {
  const copy = COPY[stat](box, yourBest);

  return (
    <Modal
      title={copy.title}
      icon={copy.icon}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          Back to work
        </button>
      }
    >
      <div className="space-y-3 pb-1 text-center">
        <p className="font-black leading-none tracking-tight tabular-nums text-4xl text-brass">
          {copy.figure}
        </p>
        <p className="text-sm leading-relaxed text-zinc-300">{copy.body}</p>
      </div>
    </Modal>
  );
}

const COPY: Record<
  StatKind,
  (
    box: PublicBox,
    yours: number | null
  ) => { title: string; figure: string; body: string; icon: React.ReactNode }
> = {
  hunters: (box) => ({
    title: "Hunters",
    figure: box.playersCount.toLocaleString("en-NG"),
    icon: <Users className="size-6 text-sky" aria-hidden />,
    body: box.playersCount === 0 ? "Nobody has tried this one." : "Playing this safe.",
  }),
  attempts: (box) => ({
    title: "Attempts",
    figure: box.attemptsCount.toLocaleString("en-NG"),
    icon: <Swords className="size-6 text-sky" aria-hidden />,
    body: "Guesses made at it, by everyone.",
  }),
  best: (box, yours) => ({
    title: "Your best",
    figure: `${(yours ?? 0).toFixed(1)}%`,
    icon: <Trophy className="size-6 text-brass" aria-hidden />,
    body: `The closest anybody has come is ${box.bestPercent.toFixed(1)}%.`,
  }),
};
