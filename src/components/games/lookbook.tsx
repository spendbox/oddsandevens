"use client";

// Virtual lookbook / room builder. Each layer is a carousel of the merchant's
// pieces; the player mixes one look and keeps it.

import { useState } from "react";
import { ActionButton, GradingOverlay, cfgList, cfgStr, type GameProps } from "./kit";

interface Choice {
  label?: string;
  emoji?: string;
  imageUrl?: string;
}

interface Slot {
  name?: string;
  options?: Choice[];
}

export default function Lookbook({ config, accent, submit, showResult }: GameProps) {
  const slots = cfgList<Slot>(config, "slots", []).filter(
    (s) => (s.options ?? []).length > 0
  );
  const [selection, setSelection] = useState<number[]>(() => slots.map(() => 0));
  const [grading, setGrading] = useState(false);

  if (slots.length === 0) {
    return (
      <p className="text-center text-sm text-zinc-500">
        This lookbook has no layers yet.
      </p>
    );
  }

  const choiceAt = (slotIndex: number): Choice =>
    slots[slotIndex].options![selection[slotIndex] % slots[slotIndex].options!.length];

  const cycle = (slotIndex: number, delta: number) => {
    setSelection((current) => {
      const next = [...current];
      const count = slots[slotIndex].options!.length;
      next[slotIndex] = (next[slotIndex] + delta + count) % count;
      return next;
    });
  };

  const finish = async () => {
    setGrading(true);
    const look = slots.map((slot, i) => ({
      layer: slot.name ?? `Layer ${i + 1}`,
      choice: choiceAt(i).label ?? "",
    }));
    const outcome = await submit(1, { look });
    if (outcome) showResult();
    else setGrading(false);
  };

  return (
    <div className="relative flex flex-col gap-4">
      {/* The assembled look */}
      <div
        className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-200 p-4"
        style={{ background: `linear-gradient(160deg, ${accent}14, #ffffff)` }}
      >
        {slots.map((slot, i) => {
          const choice = choiceAt(i);
          return choice.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={choice.imageUrl}
              alt={choice.label ?? ""}
              className="h-20 w-20 rounded-xl object-cover"
              draggable={false}
            />
          ) : (
            <span key={i} style={{ fontSize: "clamp(28px, 9vw, 46px)", lineHeight: 1.1 }}>
              {choice.emoji || "✨"}
            </span>
          );
        })}
      </div>

      {/* One row of controls per layer */}
      <div className="flex flex-col gap-2">
        {slots.map((slot, i) => {
          const choice = choiceAt(i);
          return (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {slot.name ?? `Layer ${i + 1}`}
                </p>
                <p className="truncate text-sm font-medium text-zinc-800">
                  {choice.emoji} {choice.label}
                </p>
              </div>
              <button
                onClick={() => cycle(i, -1)}
                aria-label={`Previous ${slot.name ?? "option"}`}
                className="btn-ghost px-2 text-lg"
              >
                ‹
              </button>
              <button
                onClick={() => cycle(i, 1)}
                aria-label={`Next ${slot.name ?? "option"}`}
                className="btn-ghost px-2 text-lg"
              >
                ›
              </button>
            </div>
          );
        })}
      </div>

      <ActionButton onClick={finish} accent={accent} disabled={grading}>
        {cfgStr(config, "finishLabel", "That's my look")}
      </ActionButton>

      {grading && <GradingOverlay label="Saving your look…" />}
    </div>
  );
}
