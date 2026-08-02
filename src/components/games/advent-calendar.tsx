"use client";

// Advent calendar. Doors unlock on their own day; opening one draws from the
// prize pool. The replay cooldown is what keeps it to a door a day.

import { useState } from "react";
import { cfgBool, cfgNum, cfgStr, clamp, type GameProps } from "./kit";
import type { GameOutcome } from "@/lib/games/types";

const DAY_MS = 86_400_000;

export default function AdventCalendar({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const [opened, setOpened] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);

  const doors = clamp(Math.round(cfgNum(config, "doors", 12)), 4, 31);
  const emoji = cfgStr(config, "doorEmoji", "🎄");
  const lockFuture = cfgBool(config, "lockFutureDoors", true);
  const startDate = cfgStr(config, "startDate", "");

  // Door 1 unlocks on the start date, door 2 the next day, and so on. Without
  // a start date (or with locking off) the whole calendar is open. Resolved
  // once, on mount, so the render itself stays pure.
  const [unlockedThrough] = useState(() => {
    const startMs = startDate ? Date.parse(`${startDate}T00:00:00`) : NaN;
    if (!lockFuture || Number.isNaN(startMs)) return doors;
    return clamp(Math.floor((Date.now() - startMs) / DAY_MS) + 1, 0, doors);
  });

  const openDoor = async (index: number) => {
    if (opened !== null || index >= unlockedThrough) return;
    setOpened(index);
    const result = await submit(1);
    if (!result) return;
    setOutcome(result);
    window.setTimeout(showResult, 1500);
  };

  const won = outcome?.result === "win";

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="grid w-full max-w-md grid-cols-4 gap-2">
        {Array.from({ length: doors }, (_, i) => {
          const locked = i >= unlockedThrough;
          const isOpen = opened === i;
          return (
            <button
              key={i}
              onClick={() => openDoor(i)}
              disabled={locked || opened !== null}
              aria-label={`Door ${i + 1}${locked ? " (locked)" : ""}`}
              className={
                "relative flex aspect-square flex-col items-center justify-center rounded-xl border-2 text-xs font-bold transition " +
                (locked
                  ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-300"
                  : opened === null
                    ? "cursor-pointer border-transparent text-white shadow-sm hover:-translate-y-0.5 hover:shadow-md active:scale-95"
                    : isOpen
                      ? "border-transparent text-white shadow-md"
                      : "border-transparent text-white opacity-40")
              }
              style={
                locked
                  ? undefined
                  : {
                      background: isOpen
                        ? won
                          ? "#ffffff"
                          : "#f4f4f5"
                        : `linear-gradient(150deg, ${accent}, ${accent}bb)`,
                    }
              }
            >
              {isOpen && outcome ? (
                <span className="px-1 text-center leading-tight text-zinc-800">
                  {won ? "🎉" : "🙂"}
                  <br />
                  <span className="text-[10px]">
                    {won ? outcome.prize?.description : "Nothing here"}
                  </span>
                </span>
              ) : (
                <>
                  <span className="emoji text-base">{locked ? "🔒" : emoji}</span>
                  <span className={locked ? "text-zinc-400" : "text-white/90"}>
                    {i + 1}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-center text-sm text-zinc-500">
        {opened !== null
          ? outcome
            ? "Come back tomorrow for the next door."
            : "Opening…"
          : unlockedThrough === 0
            ? "The calendar hasn't started yet — check back soon."
            : `Doors 1–${unlockedThrough} are open. Pick one.`}
      </p>
    </div>
  );
}
