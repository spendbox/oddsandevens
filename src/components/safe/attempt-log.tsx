"use client";

// The record of everything you've tried.
//
// This is the actual playing surface. A hunt runs to hundreds of attempts and
// the only way through is bookkeeping — comparing what you typed against what
// came back — so the log is built to be *read*, not just scrolled: monospaced
// so columns line up, the verdict on the same line as the guess, and the ones
// where something landed pulled out of the noise.

import { CircleSlash, MoveDown, MoveUp, Target } from "lucide-react";
import type { AttemptRecord } from "@/lib/types";

const LENGTH_ICON = {
  shorter: MoveUp,
  longer: MoveDown,
  exact: Target,
} as const;

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
    <ol className="space-y-1.5">
      {attempts.map((attempt) => (
        <AttemptRow key={attempt.ordinal} attempt={attempt} />
      ))}
    </ol>
  );
}

function AttemptRow({ attempt }: { attempt: AttemptRecord }) {
  const Icon = LENGTH_ICON[attempt.lengthHint];
  const landed = attempt.exact > 0 || attempt.miscase > 0;

  return (
    <li
      className={
        "panel flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2.5 " +
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
          title={LENGTH_LABEL[attempt.lengthHint]}
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{LENGTH_LABEL[attempt.lengthHint]}</span>
        </span>

        <Count value={attempt.exact} tone="green" label="exactly right" />
        <Count value={attempt.miscase} tone="orange" label="right, wrong case" />

        {!landed && (
          <span
            className="flex items-center gap-1 text-xs text-zinc-600"
            title="Nothing landed"
          >
            <CircleSlash className="size-3.5" aria-hidden />
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * A count, and only a count.
 *
 * There is deliberately no way to tell *which* positions these refer to —
 * working that out from the pattern of your own guesses is the entire game.
 */
function Count({
  value,
  tone,
  label,
}: {
  value: number;
  tone: "green" | "orange";
  label: string;
}) {
  if (value === 0) return null;
  return (
    <span
      title={`${value} ${label}`}
      className={
        "flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs font-bold " +
        (tone === "green"
          ? "bg-mark-green/20 text-mark-green"
          : "bg-mark-orange/20 text-mark-orange")
      }
    >
      <span className={"size-2 rounded-full " + (tone === "green" ? "bg-mark-green" : "bg-mark-orange")} aria-hidden />
      {value}
    </span>
  );
}
