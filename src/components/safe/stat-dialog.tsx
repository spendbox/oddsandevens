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
import { plural } from "@/lib/plural";
import type { StatKind } from "./scene-hud";
import type { PublicBox } from "@/lib/types";

export function StatDialog({
  stat,
  box,
  onClose,
}: {
  stat: StatKind;
  box: PublicBox;
  onClose: () => void;
}) {
  const copy = COPY[stat](box);

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
  (box: PublicBox) => { title: string; figure: string; body: string; icon: React.ReactNode }
> = {
  hunters: (box) => ({
    title: "Hunters",
    figure: box.playersCount.toLocaleString("en-NG"),
    icon: <Users className="size-6 text-sky" aria-hidden />,
    body:
      box.playersCount === 0
        ? "Nobody has tried this one yet. Whatever you score is the score to beat."
        : `${plural(box.playersCount, "person", "people")} ${
            box.playersCount === 1 ? "has" : "have"
          } made at least one guess at this password. Only one of them can win it, and it has not happened yet.`,
  }),
  attempts: (box) => ({
    title: "Attempts",
    figure: box.attemptsCount.toLocaleString("en-NG"),
    icon: <Swords className="size-6 text-sky" aria-hidden />,
    body:
      box.attemptsCount === 0
        ? "No guesses at all so far. This safe has never been touched."
        : `Guesses made at this safe, by everybody, since it went up. Each one cost somebody a life — and none of them was the password.`,
  }),
  best: (box) => ({
    title: "Best yet",
    figure: `${box.bestPercent.toFixed(1)}%`,
    icon: <Trophy className="size-6 text-brass" aria-hidden />,
    body:
      box.bestPercent <= 0
        ? "Nobody has scored anything on this one. Anything above zero puts you in front."
        : box.bestPercent >= 90
          ? `Somebody got within ${(100 - box.bestPercent).toFixed(1)} points of this password, and it is still shut. They are close. So, probably, are you.`
          : `The closest anybody has come. No name on it and no date — just how far this password has been pushed, by anyone, so far.`,
  }),
};
