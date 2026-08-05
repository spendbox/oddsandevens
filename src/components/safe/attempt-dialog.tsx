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

import { Lock, MoveDown, MoveUp, Target } from "lucide-react";
import { visible } from "@/lib/constants";
import { Modal } from "@/components/ui/modal";
import { plural } from "@/lib/plural";
import type { AttemptRecord } from "@/lib/types";
import { ScorePill } from "./score-pill";

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
  onClose,
}: {
  attempt: AttemptRecord;
  onClose: () => void;
}) {
  const length = LENGTH_COPY[attempt.lengthHint];
  const Icon = length.icon;

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

        {attempt.breakdown ? (
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
              body="That character is in the password, just not where you put it."
            />
          </>
        ) : (
          <LockedBreakdown />
        )}
      </div>
    </Modal>
  );
}

/**
 * What a score is, for a player who hasn't bought the breakdown.
 *
 * This used to be an advert for Colour Read, price and all. It isn't now. The
 * shelf sells the shelf; a player who has stopped on one attempt to think is
 * asking what the number means, and the honest answer — the same score can be
 * reached several ways — is more useful to them than a price tag, and is also
 * the thing that makes the game interesting.
 */
function LockedBreakdown() {
  return (
    <div className="flex gap-3 border-t border-white/10 pt-3">
      <Lock className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-bold text-foreground">What Makes Up the Score?</p>
        <p className="text-sm leading-relaxed text-zinc-500">
          A score is only a measure of how close your guess is to the password.
          The higher the score, the closer you are to unlocking the Spendbox.
        </p>
        <p className="text-sm leading-relaxed text-zinc-500">
          Keep in mind that the same score can be reached in many different ways.
          Two guesses might receive identical scores while sharing completely
          different similarities to the password. Every attempt gives you another
          piece of the puzzle, rewarding careful thinking, pattern recognition,
          and persistence.
        </p>
      </div>
    </div>
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
