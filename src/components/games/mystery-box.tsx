"use client";

// Pick-a-box. Which box the player picks is theirs; what's inside is the
// server's weighted draw.

import { useState } from "react";
import { cfgNum, cfgStr, clamp, type GameProps } from "./kit";
import type { GameOutcome } from "@/lib/games/types";

export default function MysteryBox({ config, accent, submit, showResult }: GameProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);

  const count = clamp(Math.round(cfgNum(config, "boxCount", 3)), 2, 9);
  const emoji = cfgStr(config, "boxEmoji", "🎁");
  const prompt = cfgStr(config, "prompt", "Pick a box");

  const open = async (index: number) => {
    if (picked !== null) return;
    setPicked(index);
    const result = await submit(1);
    if (!result) return;
    setOutcome(result);
    window.setTimeout(showResult, 1400);
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-center text-lg font-semibold text-zinc-800">
        {picked === null ? prompt : outcome ? "" : "Opening…"}
      </p>

      <div
        className="grid w-full max-w-sm gap-3"
        style={{
          gridTemplateColumns: `repeat(${count <= 3 ? count : 3}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: count }, (_, i) => {
          const isPicked = picked === i;
          const revealed = isPicked && outcome !== null;
          const won = revealed && outcome?.result === "win";
          return (
            <button
              key={i}
              onClick={() => open(i)}
              disabled={picked !== null}
              aria-label={`Box ${i + 1}`}
              className={
                "relative flex aspect-square items-center justify-center rounded-2xl border-2 text-4xl shadow-sm transition " +
                (picked === null
                  ? "cursor-pointer hover:-translate-y-1 hover:shadow-md active:scale-95 "
                  : "cursor-default ") +
                (isPicked ? "scale-105" : picked !== null ? "opacity-40" : "")
              }
              style={{
                borderColor: isPicked ? accent : "#e4e4e7",
                background: revealed
                  ? won
                    ? `linear-gradient(135deg, ${accent}, ${accent}bb)`
                    : "#f4f4f5"
                  : "#ffffff",
              }}
            >
              {revealed ? (
                <span className="px-1 text-center text-[11px] leading-tight font-bold text-white mix-blend-normal">
                  {won ? (
                    <span className="text-white">
                      🎉
                      <br />
                      {outcome?.prize?.description}
                    </span>
                  ) : (
                    <span className="text-zinc-500">
                      🙂
                      <br />
                      Empty
                    </span>
                  )}
                </span>
              ) : (
                <span className={isPicked ? "animate-pulse" : ""}>{emoji}</span>
              )}
            </button>
          );
        })}
      </div>

      {picked !== null && !outcome && (
        <p className="text-sm text-zinc-500">Let&apos;s see what&apos;s inside…</p>
      )}
    </div>
  );
}
