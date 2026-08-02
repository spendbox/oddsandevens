"use client";

// Memory match. Score rewards both accuracy and speed: clearing the board with
// time to spare is what beats the prize threshold.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GradingOverlay,
  Hud,
  cfgNum,
  cfgStr,
  clamp,
  shuffle,
  useCountdown,
  useOnce,
  type GameProps,
} from "./kit";
import { emojiList } from "@/lib/games/catalog";

interface Card {
  id: number;
  face: string;
  matched: boolean;
}

export default function MemoryMatch({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const pairs = clamp(Math.round(cfgNum(config, "pairs", 6)), 3, 10);
  const timeLimit = clamp(Math.round(cfgNum(config, "timeLimit", 90)), 30, 300);
  const faces = emojiList(cfgStr(config, "faces", "🍕 🍔 🌮 🍜 🍩 ☕ 🥗 🍣"), [
    "🍕", "🍔", "🌮", "🍜", "🍩", "☕",
  ]);

  const [cards, setCards] = useState<Card[]>(() => {
    const chosen = faces.slice(0, pairs);
    // Fall back to repeats if the merchant gave fewer faces than pairs.
    while (chosen.length < pairs) chosen.push(faces[chosen.length % faces.length]);
    return shuffle(
      chosen.flatMap((face, i) => [
        { id: i * 2, face, matched: false },
        { id: i * 2 + 1, face, matched: false },
      ])
    );
  });
  const [flipped, setFlipped] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [grading, setGrading] = useState(false);
  const [running, setRunning] = useState(true);
  const timeLeftRef = useRef(timeLimit);
  const once = useOnce();

  const finish = useCallback(
    (cleared: boolean) => {
      once(() => {
        setRunning(false);
        setGrading(true);
        // Clearing the board is worth a base 300, plus 10 a second saved,
        // minus a small penalty per wasted flip.
        const score = cleared
          ? Math.max(
              0,
              300 + timeLeftRef.current * 10 - Math.max(0, moves - pairs) * 5
            )
          : 0;
        void submit(score, { cleared, moves }).then((outcome) => {
          if (outcome) showResult();
        });
      });
    },
    [once, submit, showResult, moves, pairs]
  );

  const timeLeft = useCountdown(timeLimit, running, () => finish(false));
  // Mirrored into a ref so scoring can read the clock without re-arming it.
  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  const flip = (index: number) => {
    if (grading || flipped.length >= 2) return;
    if (cards[index].matched || flipped.includes(index)) return;
    setFlipped((current) => [...current, index]);
  };

  useEffect(() => {
    if (flipped.length !== 2) return;
    const [a, b] = flipped;
    const isMatch = cards[a].face === cards[b].face;
    const id = window.setTimeout(
      () => {
        setMoves((m) => m + 1);
        if (isMatch) {
          setCards((current) =>
            current.map((card, i) =>
              i === a || i === b ? { ...card, matched: true } : card
            )
          );
        }
        setFlipped([]);
      },
      isMatch ? 350 : 800
    );
    return () => clearTimeout(id);
  }, [flipped, cards]);

  useEffect(() => {
    if (cards.length > 0 && cards.every((card) => card.matched)) {
      window.setTimeout(() => finish(true), 400);
    }
  }, [cards, finish]);

  const columns = cards.length <= 12 ? 4 : cards.length <= 16 ? 4 : 5;

  return (
    <div className="w-full">
      <Hud
        items={[
          { label: "Pairs", value: `${cards.filter((c) => c.matched).length / 2}/${pairs}` },
          { label: "Time", value: `${timeLeft}s` },
          { label: "Flips", value: moves },
        ]}
      />
      <div className="relative">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {cards.map((card, i) => {
            const shown = card.matched || flipped.includes(i);
            return (
              <button
                key={card.id}
                onClick={() => flip(i)}
                aria-label={shown ? card.face : "Face-down card"}
                className={
                  "emoji-piece flex aspect-square items-center justify-center rounded-xl border-2 transition " +
                  (shown
                    ? "border-transparent bg-white shadow-inner"
                    : "cursor-pointer border-transparent text-white shadow-sm active:scale-95")
                }
                style={{
                  background: shown ? "#ffffff" : `linear-gradient(145deg, ${accent}, ${accent}bb)`,
                  fontSize: "clamp(20px, 7vw, 34px)",
                  lineHeight: 1,
                  opacity: card.matched ? 0.55 : 1,
                }}
              >
                {shown ? card.face : "?"}
              </button>
            );
          })}
        </div>
        {grading && (
          <div className="absolute inset-0 rounded-2xl">
            <GradingOverlay />
          </div>
        )}
      </div>
      <p className="mt-3 text-center text-sm text-zinc-500">
        Clear the board before the clock runs out — the faster you finish, the
        higher your score.
      </p>
    </div>
  );
}
