"use client";

// The record of everything you've tried.
//
// This is the actual playing surface. A hunt runs to hundreds of attempts and
// the only way through is bookkeeping — comparing what you typed against what
// it scored — so the log is built to be *read*: monospaced so columns line up,
// the score on the same line as the guess, and banded by colour so the run
// where you were getting somewhere has a shape you can see without reading a
// digit.
//
// Every row opens. The compressed form is right for skimming and wrong for the
// moment you stop on one and think, which is where the game is played.
//
// And it sorts. Chronological order is right while you're playing and useless
// afterwards: three hundred attempts in, the question is never "what did I try
// last?" but "what are my best five, and what do they have in common?".

import { useMemo, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Clock, MoveDown, MoveUp, Target } from "lucide-react";
import { LENGTH_HINT_COPY } from "@/lib/game/feedback";
import type { AttemptRecord } from "@/lib/types";
import { Boxy } from "@/components/art/boxy";
import { AttemptDialog } from "./attempt-dialog";
import { ScorePill } from "./score-pill";

export type AttemptSort = "recent" | "best" | "worst";

const SORTS: { id: AttemptSort; label: string; icon: typeof Clock }[] = [
  { id: "recent", label: "Newest", icon: Clock },
  { id: "best", label: "Best", icon: ArrowDownWideNarrow },
  { id: "worst", label: "Worst", icon: ArrowUpNarrowWide },
];

const LENGTH_ICON = {
  shorter: MoveUp,
  longer: MoveDown,
  exact: Target,
} as const;

const LENGTH_STYLE = {
  shorter: "text-sky-300",
  longer: "text-sky-300",
  exact: "text-mark-green",
} as const;

export function AttemptLog({ attempts }: { attempts: AttemptRecord[] }) {
  const [open, setOpen] = useState<AttemptRecord | null>(null);
  const [sort, setSort] = useState<AttemptSort>("recent");

  // The server sends them newest first. Sorting is a copy, never in place —
  // the array belongs to the view and is re-used across renders.
  const ordered = useMemo(() => {
    if (sort === "recent") return attempts;
    const copy = [...attempts];
    copy.sort((a, b) =>
      sort === "best"
        ? b.scorePercent - a.scorePercent || b.ordinal - a.ordinal
        : a.scorePercent - b.scorePercent || a.ordinal - b.ordinal
    );
    return copy;
  }, [attempts, sort]);

  if (attempts.length === 0) {
    return (
      <div className="panel rounded-3xl px-4 py-8 text-center">
        <Boxy mood="sly" className="mx-auto size-24" />
        <p className="mt-1 font-black tracking-tight">Nothing tried yet.</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-400">
          Every guess costs one life and comes back with two things: whether
          it&apos;s the right length, and how close it is out of 100.
        </p>
      </div>
    );
  }

  return (
    <>
      {attempts.length > 1 && (
        <div
          role="group"
          aria-label="Sort attempts"
          className="flex gap-1 rounded-2xl bg-black/25 p-1.5"
        >
          {SORTS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={sort === id}
              onClick={() => setSort(id)}
              className={
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition " +
                (sort === id
                  ? "bg-brass text-ink shadow-[inset_0_1.5px_0_rgba(255,255,255,0.4),0_2px_0_var(--brass-deep)]"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100")
              }
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}

      <ol className="space-y-1.5">
        {ordered.map((attempt) => (
          <AttemptRow
            key={attempt.ordinal}
            attempt={attempt}
            onOpen={() => setOpen(attempt)}
          />
        ))}
      </ol>

      {open && (
        <AttemptDialog attempt={open} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function AttemptRow({
  attempt,
  onOpen,
}: {
  attempt: AttemptRecord;
  onOpen: () => void;
}) {
  const Icon = LENGTH_ICON[attempt.lengthHint];

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Attempt ${attempt.ordinal + 1}: ${attempt.value}, scored ${attempt.scorePercent}%`}
        className={
          "panel panel-lift flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl px-3 py-2.5 text-left " +
          (attempt.scorePercent >= 45 ? "border-brass/40" : "")
        }
      >
        <span className="w-8 shrink-0 text-right font-mono text-xs text-zinc-600">
          {attempt.ordinal + 1}
        </span>

        {/* `break-all` matters: a 40-character guess has no spaces to break on. */}
        <code className="min-w-0 flex-1 break-all font-mono text-sm text-zinc-200">
          {attempt.value}
        </code>

        <span className="flex shrink-0 items-center gap-2.5">
          <span
            className={`flex items-center gap-1 text-xs ${LENGTH_STYLE[attempt.lengthHint]}`}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">
              {LENGTH_HINT_COPY[attempt.lengthHint]}
            </span>
          </span>

          {/*
            The breakdown appears here only once Colour Read is bought. Until
            then the server doesn't send it at all, so there is nothing to
            reveal by poking at the page.
          */}
          {attempt.breakdown && (
            <span className="hidden items-center gap-1 font-mono text-[11px] sm:flex">
              <Part value={attempt.breakdown.exact} tone="bg-mark-green/25 text-mark-green" />
              <Part value={attempt.breakdown.miscase} tone="bg-mark-orange/25 text-mark-orange" />
              <Part value={attempt.breakdown.elsewhere} tone="bg-sky-500/20 text-sky-300" />
            </span>
          )}

          <ScorePill percent={attempt.scorePercent} />
        </span>
      </button>
    </li>
  );
}

function Part({ value, tone }: { value: number; tone: string }) {
  return (
    <span
      className={`min-w-5 rounded px-1 py-0.5 text-center font-bold ${tone} ${value === 0 ? "opacity-30" : ""}`}
    >
      {value}
    </span>
  );
}
