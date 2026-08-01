"use client";

// Knockout poll. Contenders are paired off; the player's pick advances until
// one is left. Odd rounds give the last contender a bye.

import { useMemo, useState } from "react";
import { ActionButton, GradingOverlay, cfgList, cfgStr, shuffle, type GameProps } from "./kit";

interface Entrant {
  label?: string;
  emoji?: string;
  imageUrl?: string;
}

export default function BracketPoll({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const entrants = useMemo(
    () =>
      shuffle(
        cfgList<Entrant>(config, "entrants", []).filter(
          (e) => (e.label ?? "").trim().length > 0
        )
      ),
    [config]
  );

  const [pool, setPool] = useState<Entrant[]>(entrants);
  const [nextRound, setNextRound] = useState<Entrant[]>([]);
  const [index, setIndex] = useState(0);
  const [votes, setVotes] = useState<string[]>([]);
  const [champion, setChampion] = useState<Entrant | null>(null);
  const [grading, setGrading] = useState(false);

  if (entrants.length < 2) {
    return (
      <p className="text-center text-sm text-zinc-500">
        This poll needs at least two contenders.
      </p>
    );
  }

  const vote = async (winner: Entrant) => {
    const allVotes = [...votes, winner.label ?? ""];
    setVotes(allVotes);

    const advancing = [...nextRound, winner];
    const remaining = pool.slice(index + 2);

    if (remaining.length === 0) {
      // Round over. One survivor means we have a champion.
      if (advancing.length === 1) {
        setChampion(advancing[0]);
        setGrading(true);
        await submit(1, { champion: advancing[0].label, votes: allVotes });
        setGrading(false);
        return;
      }
      setPool(advancing);
      setNextRound([]);
      setIndex(0);
      return;
    }

    if (remaining.length === 1) {
      // Odd contender out: they get a bye into the next round.
      const withBye = [...advancing, remaining[0]];
      if (withBye.length === 1) {
        setChampion(withBye[0]);
        return;
      }
      setPool(withBye);
      setNextRound([]);
      setIndex(0);
      return;
    }

    setNextRound(advancing);
    setIndex(index + 2);
  };

  if (champion) {
    return (
      <div className="relative flex flex-col items-center gap-4 text-center">
        <span className="text-5xl">🏆</span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Your champion
          </p>
          <h3 className="text-2xl font-bold text-zinc-900">
            {champion.emoji} {champion.label}
          </h3>
        </div>
        <ActionButton onClick={showResult} accent={accent} disabled={grading}>
          {grading ? "Saving your vote…" : "Continue"}
        </ActionButton>
        {grading && <GradingOverlay label="Saving your vote…" />}
      </div>
    );
  }

  const left = pool[index];
  const right = pool[index + 1];
  const roundSize = pool.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {roundSize <= 2 ? "Final" : `Round of ${roundSize}`}
        </p>
        <h3 className="mt-1 text-xl font-bold text-zinc-900">
          {cfgStr(config, "question", "Which one wins?")}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[left, right].map((entrant, i) => (
          <button
            key={i}
            onClick={() => vote(entrant)}
            className="group flex cursor-pointer flex-col items-center gap-2 overflow-hidden rounded-2xl border-2 border-zinc-200 bg-white p-4 transition hover:-translate-y-1 hover:shadow-lg active:scale-95"
            style={{ borderColor: undefined }}
          >
            {entrant.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={entrant.imageUrl}
                alt=""
                className="aspect-square w-full rounded-xl object-cover"
                draggable={false}
              />
            ) : (
              <span
                className="flex aspect-square w-full items-center justify-center rounded-xl"
                style={{
                  background: `linear-gradient(145deg, ${accent}22, ${accent}11)`,
                  fontSize: "clamp(30px, 12vw, 56px)",
                  lineHeight: 1,
                }}
              >
                {entrant.emoji || "🥊"}
              </span>
            )}
            <span className="text-sm font-semibold text-zinc-800">
              {entrant.label}
            </span>
          </button>
        ))}
      </div>

      <p className="text-center text-sm text-zinc-500">Tap the one you&apos;d pick.</p>
    </div>
  );
}
