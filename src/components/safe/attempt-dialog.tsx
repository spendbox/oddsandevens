"use client";

// One attempt, read properly.
//
// The log row has to be scannable, so it compresses everything into a score
// and an icon. That's right for skimming three hundred rows and wrong for the
// moment you stop on one and think — which is most of the game. This is that
// moment: the guess in full, the score large, and what it does and doesn't
// tell you.
//
// What it never explains is *how* the score was arrived at. The weights behind
// it aren't printed here, in the rules, or anywhere else a player can reach —
// that's what Colour Read is for, and even Colour Read gives the components
// rather than the arithmetic.

import { History, MoveDown, MoveUp, Target } from "lucide-react";
import { visible } from "@/lib/constants";
import { Modal } from "@/components/ui/modal";
import { plural } from "@/lib/plural";
import type { AttemptRecord } from "@/lib/types";
import { ScorePill } from "./score-pill";
import { AttemptSummary } from "./result-dialog";

const LENGTH_COPY = {
  shorter: {
    icon: MoveUp,
    title: "Too short",
    body: "The password has more characters than this guess. Add some.",
    tone: "text-sky-600",
  },
  longer: {
    icon: MoveDown,
    title: "Too long",
    body: "The password has fewer characters than this guess. Take some away.",
    tone: "text-sky-600",
  },
  exact: {
    icon: Target,
    title: "Right length",
    body: "This guess is exactly as long as the password.",
    tone: "text-mark-green",
  },
} as const;

export function AttemptDialog({
  attempt,
  /**
   * Every attempt on this hunt, newest first.
   *
   * The summaries that appear the moment a guess lands used to be the only
   * place the reasoning was said, and they were gone by the next guess. Now
   * they are kept: this is where a player scrolls back through the hunt and
   * reads the run of them together, which is a different and better thing than
   * reading one at a time — three "cooler"s in a row is a sentence about the
   * character you keep changing.
   */
  history = [],
  onClose,
}: {
  attempt: AttemptRecord;
  history?: AttemptRecord[];
  onClose: () => void;
}) {
  const length = LENGTH_COPY[attempt.lengthHint];
  const Icon = length.icon;

  /*
   * Each summary needs the two numbers it was originally written against: the
   * best before that guess, and the guess immediately before it. Both are
   * recovered from the log rather than stored, so an old summary reads exactly
   * as it did at the time.
   *
   * The log arrives newest-first, so "earlier" is a *higher* index.
   */
  const past = history.map((one, i) => {
    const earlier = history.slice(i + 1);
    return {
      attempt: one,
      previousBest: earlier.reduce((top, a) => Math.max(top, a.scorePercent), 0),
      previousScore: earlier.length > 0 ? earlier[0].scorePercent : null,
    };
  });

  return (
    <Modal
      title="This guess"
      subtitle={new Date(attempt.at).toLocaleString()}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          Back to the hunt
        </button>
      }
    >
      <div className="space-y-4 pb-1">
        <div className="text-center">
          <ScorePill percent={attempt.scorePercent} size="lg" />
          <p className="mt-1.5 text-sm text-zinc-500">
            {attempt.scorePercent >= 100
              ? "The password itself."
              : "How close this guess is. 100% is the password."}
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">You typed</p>
          {/* `break-all`: a 40-character guess has no spaces to break on. */}
          <code className="mt-1 block break-all rounded-xl bg-black/30 px-3 py-2.5 font-mono text-base text-foreground">
            {visible(attempt.value)}
          </code>
          <p className="mt-1 text-xs text-zinc-500">
            {plural(attempt.value.length, "character")}
          </p>
        </div>

        <Row
          icon={<Icon className={`size-4 ${length.tone}`} aria-hidden />}
          title={length.title}
          body={length.body}
        />

        {/* Only when Colour Read is running. Nothing stands in for it when it
            isn't: the score's own explanation is the thing being sold. */}
        {attempt.breakdown && (
          <>
            <Row
              icon={<Dot tone="bg-mark-green" />}
              title={
                attempt.breakdown.exact === 0
                  ? "Nothing exactly right"
                  : `${plural(attempt.breakdown.exact, "character")} exactly right`
              }
              body="Right character, right place, right case. You aren't told which positions."
            />
            <Row
              icon={<Dot tone="bg-mark-orange" />}
              title={
                attempt.breakdown.miscase === 0
                  ? "Nothing in the wrong case"
                  : `${plural(attempt.breakdown.miscase, "character")} right, wrong case`
              }
              body="Right letter, right place, wrong case. Flip it and it becomes exact."
            />
            <Row
              icon={<Dot tone="bg-sky-500" />}
              title={
                attempt.breakdown.elsewhere === 0
                  ? "Nothing in the wrong place"
                  : `${plural(attempt.breakdown.elsewhere, "character")} in there somewhere else`
              }
              body="Exactly that character, case and all, is in the password — just not where you put it."
            />
            <Row
              icon={<Dot tone="bg-grape" />}
              title={
                attempt.breakdown.elsewhereMiscase === 0
                  ? "Nothing misplaced and miscased"
                  : `${plural(
                      attempt.breakdown.elsewhereMiscase,
                      "character"
                    )} somewhere else, wrong case`
              }
              body="The letter is in the password, but in the other case and in another position. Two things to fix, and the least any hit is worth."
            />
          </>
        )}

        {past.length > 0 && (
          <div className="border-t border-white/10 pt-3">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-zinc-500">
              <History className="size-3.5" aria-hidden />
              Every guess, and what it said
            </p>
            {/* Capped in height rather than in count: a siege runs to hundreds
                of these and the dialog should not become the page. */}
            <div className="mt-2 max-h-[22rem] space-y-1.5 overflow-y-auto pr-0.5">
              {past.map((row) => (
                <div
                  key={row.attempt.ordinal}
                  className={
                    "flex items-start gap-3 rounded-2xl px-2.5 py-2 " +
                    (row.attempt.ordinal === attempt.ordinal
                      ? "bg-brass/12 ring-2 ring-brass/40"
                      : "bg-white/5")
                  }
                >
                  <AttemptSummary
                    attempt={row.attempt}
                    previousBest={row.previousBest}
                    previousScore={row.previousScore}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Row({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 border-t border-white/10 pt-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="mt-0.5 text-sm leading-snug text-zinc-500">{body}</p>
      </div>
    </div>
  );
}

function Dot({ tone }: { tone: string }) {
  return <span className={`block size-3.5 rounded-full ${tone}`} aria-hidden />;
}
