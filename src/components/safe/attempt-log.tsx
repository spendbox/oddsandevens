"use client";

// The record of everything you've tried.
//
// This is the actual playing surface. A hunt runs to hundreds of attempts and
// the only way through is bookkeeping — comparing what you typed against what
// came back — so the log is built to be *read*: monospaced so columns line up,
// the verdict on the same line as the guess, and the ones where something
// landed pulled out of the noise.
//
// Every row opens. The compressed form is right for skimming and wrong for the
// moment you stop on one and think, which is where the game is actually
// played.

import { useState } from "react";
import { CircleSlash, MoveDown, MoveUp, Target } from "lucide-react";
import type { AttemptRecord } from "@/lib/types";
import { AttemptDialog } from "./attempt-dialog";

const LENGTH_ICON = {
  shorter: MoveUp,
  longer: MoveDown,
  exact: Target,
} as const;

// Phrased as instructions rather than observations: "Too short" leaves the
// reader to work out which way to move, and after two hundred attempts nobody
// should have to.
const LENGTH_LABEL = {
  shorter: "Add characters",
  longer: "Remove characters",
  exact: "Right length",
} as const;

const LENGTH_STYLE = {
  shorter: "text-sky-300",
  longer: "text-sky-300",
  exact: "text-mark-green",
} as const;

export function AttemptLog({ attempts }: { attempts: AttemptRecord[] }) {
  const [open, setOpen] = useState<AttemptRecord | null>(null);

  if (attempts.length === 0) {
    return (
      <p className="panel rounded-2xl px-4 py-8 text-center text-sm text-zinc-500">
        Nothing tried yet. Every guess costs one life and answers three things:
        whether it&apos;s the right length, how many characters landed exactly
        right, and how many were right but in the wrong case.
      </p>
    );
  }

  return (
    <>
      <ol className="space-y-1.5">
        {attempts.map((attempt) => (
          <AttemptRow
            key={attempt.ordinal}
            attempt={attempt}
            onOpen={() => setOpen(attempt)}
          />
        ))}
      </ol>
      {open && <AttemptDialog attempt={open} onClose={() => setOpen(null)} />}
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
  const landed = attempt.exact > 0 || attempt.miscase > 0;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Attempt ${attempt.ordinal + 1}: ${attempt.value}`}
        className={
          "panel flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2.5 text-left transition hover:border-brass/40 " +
          (landed ? "border-brass/30" : "")
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
            <span className="hidden sm:inline">{LENGTH_LABEL[attempt.lengthHint]}</span>
          </span>

          <Count value={attempt.exact} tone="green" />
          <Count value={attempt.miscase} tone="orange" />

          {!landed && (
            <span className="flex items-center gap-1 text-xs text-zinc-600">
              <CircleSlash className="size-3.5" aria-hidden />
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * A count, and only a count.
 *
 * There is deliberately no way to tell *which* positions these refer to —
 * working that out from the pattern of your own guesses is the entire game.
 */
function Count({ value, tone }: { value: number; tone: "green" | "orange" }) {
  if (value === 0) return null;
  return (
    <span
      className={
        "flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs font-bold " +
        (tone === "green"
          ? "bg-mark-green/20 text-mark-green"
          : "bg-mark-orange/20 text-mark-orange")
      }
    >
      <span
        className={"size-2 rounded-full " + (tone === "green" ? "bg-mark-green" : "bg-mark-orange")}
        aria-hidden
      />
      {value}
    </span>
  );
}
