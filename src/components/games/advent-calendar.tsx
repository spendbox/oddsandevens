"use client";

// Advent calendar. Doors unlock on their own day; opening one scores.
//
// It used to draw a prize from a pool, which made it the one game on the
// platform you couldn't win with points — the weekly board decides every other
// prize, and a calendar that hands out its own codes sits outside that. So a
// door is worth points now, and the points are the number of days you have
// come back: door one is 100, your fifth day is 500. Best score of the week
// takes the prize, and the only way to beat someone is to keep turning up,
// which is what a calendar is for.

import { useState } from "react";
import {
  GradingOverlay,
  Hud,
  cfgBool,
  cfgNum,
  cfgStr,
  clamp,
  type GameProps,
} from "./kit";

const DAY_MS = 86_400_000;
/** Points a single door is worth on your first day. */
const PER_DOOR = 100;

export default function AdventCalendar({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const [opened, setOpened] = useState<number | null>(null);
  const [earned, setEarned] = useState(0);
  const [grading, setGrading] = useState(false);

  const doors = clamp(Math.round(cfgNum(config, "doors", 12)), 4, 31);
  const emoji = cfgStr(config, "doorEmoji", "🎄");
  const lockFuture = cfgBool(config, "lockFutureDoors", true);
  const startDate = cfgStr(config, "startDate", "");
  // How many doors this player has already opened this week. The server counts
  // it from their finished rounds — the browser is in no position to know.
  const openedBefore = Math.max(Math.round(cfgNum(config, "openedDoors", 0)), 0);
  const streak = openedBefore + 1;
  const worth = streak * PER_DOOR;

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
    setEarned(worth);
    setGrading(true);
    const result = await submit(worth, { door: index + 1, streak });
    if (!result) {
      setGrading(false);
      return;
    }
    window.setTimeout(showResult, 1400);
  };

  return (
    <div className="relative flex w-full flex-col items-center gap-4">
      <Hud
        items={[
          { label: "Day", value: streak, icon: "📅" },
          { label: "This door is worth", value: worth, icon: "⚡" },
        ]}
      />

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
                "relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 text-xs font-bold transition " +
                (locked
                  ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-300"
                  : opened === null
                    ? "cursor-pointer border-transparent text-white shadow-md hover:-translate-y-0.5 active:scale-95"
                    : isOpen
                      ? "animate-pop border-transparent text-white shadow-lg"
                      : "border-transparent text-white opacity-30")
              }
              style={
                locked
                  ? undefined
                  : {
                      background: isOpen
                        ? "linear-gradient(150deg, #fbbf24, #f59e0b)"
                        : `linear-gradient(150deg, ${accent}, color-mix(in oklab, ${accent}, black 25%))`,
                    }
              }
            >
              {isOpen ? (
                <>
                  <span className="emoji text-2xl">🎉</span>
                  <span className="mt-0.5 text-sm font-extrabold">+{earned}</span>
                </>
              ) : (
                <>
                  <span className="emoji text-xl">{locked ? "🔒" : emoji}</span>
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
          ? "Come back tomorrow — the next door is worth more."
          : unlockedThrough === 0
            ? "The calendar hasn't started yet."
            : `Doors 1–${unlockedThrough} are open. Pick one.`}
      </p>

      {grading && <GradingOverlay />}
    </div>
  );
}
