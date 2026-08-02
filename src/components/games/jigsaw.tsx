"use client";

// Photo puzzle. Tap two pieces to swap them; solving faster scores higher.
// Without a picture the pieces fall back to a numbered gradient, so the game
// is still playable the moment it's created.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GradingOverlay,
  Hud,
  Stage,
  cfgNum,
  cfgStr,
  clamp,
  shuffle,
  useCountdown,
  useOnce,
  type GameProps,
} from "./kit";

export default function Jigsaw({ config, accent, submit, showResult }: GameProps) {
  const size = clamp(Math.round(cfgNum(config, "size", 3)), 2, 5);
  const timeLimit = clamp(Math.round(cfgNum(config, "timeLimit", 180)), 60, 600);
  const imageUrl = cfgStr(config, "imageUrl", "");
  const total = size * size;

  // order[slot] = which piece is sitting in that slot.
  const [order, setOrder] = useState<number[]>(() => {
    let shuffled = shuffle([...Array(total).keys()]);
    // Never open on an already-solved board.
    if (shuffled.every((piece, slot) => piece === slot)) {
      shuffled = [...shuffled.slice(1), shuffled[0]];
    }
    return shuffled;
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [grading, setGrading] = useState(false);
  const [running, setRunning] = useState(true);
  const timeLeftRef = useRef(timeLimit);
  const once = useOnce();

  const solved = useMemo(
    () => order.every((piece, slot) => piece === slot),
    [order]
  );

  const finish = useCallback(
    (didSolve: boolean) => {
      once(() => {
        setRunning(false);
        setGrading(true);
        const score = didSolve ? 200 + timeLeftRef.current * 3 : 0;
        void submit(score, { solved: didSolve, moves }).then((outcome) => {
          if (outcome) showResult();
        });
      });
    },
    [once, submit, showResult, moves]
  );

  const timeLeft = useCountdown(timeLimit, running, () => finish(false));
  // Mirrored into a ref so the scoring callback can read it without becoming
  // a dependency of the countdown.
  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  useEffect(() => {
    if (solved && running) window.setTimeout(() => finish(true), 500);
  }, [solved, running, finish]);

  const tap = (slot: number) => {
    if (grading || solved) return;
    if (selected === null) {
      setSelected(slot);
      return;
    }
    if (selected === slot) {
      setSelected(null);
      return;
    }
    setOrder((current) => {
      const next = [...current];
      [next[selected], next[slot]] = [next[slot], next[selected]];
      return next;
    });
    setMoves((m) => m + 1);
    setSelected(null);
  };

  return (
    <div className="w-full">
      <Hud
        items={[
          { label: "Time left", value: `${timeLeft}s`, icon: "⏱️" },
          { label: "Swaps", value: moves, icon: "🔄" },
        ]}
      />
      <Stage ratio="1 / 1" className="bg-zinc-800 p-1">
        <div
          className="grid h-full w-full gap-0.5"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {order.map((piece, slot) => {
            const row = Math.floor(piece / size);
            const col = piece % size;
            const isSelected = selected === slot;
            return (
              <button
                key={slot}
                onClick={() => tap(slot)}
                aria-label={`Piece ${piece + 1} in slot ${slot + 1}`}
                className="relative overflow-hidden rounded-sm transition"
                style={{
                  outline: isSelected ? `3px solid ${accent}` : "none",
                  outlineOffset: "-3px",
                  transform: isSelected ? "scale(0.94)" : "none",
                  backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
                  backgroundSize: `${size * 100}% ${size * 100}%`,
                  backgroundPosition: `${(col / (size - 1)) * 100}% ${
                    (row / (size - 1)) * 100
                  }%`,
                  background: imageUrl
                    ? undefined
                    : `linear-gradient(${(piece * 360) / total}deg, ${accent}, #ffffff)`,
                }}
              >
                {!imageUrl && (
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white drop-shadow">
                    {piece + 1}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {grading && <GradingOverlay />}
      </Stage>
      <p className="mt-2 text-center text-sm text-zinc-500">
        {solved
          ? "Solved!"
          : "Tap one piece, then another, to swap them."}
      </p>
    </div>
  );
}
