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
import { Modal } from "@/components/ui/modal";
import { plural } from "@/lib/plural";
import { POWER_UPS } from "@/lib/game/power-ups";
import { formatNaira } from "@/lib/game/rewards";
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
      title={`Attempt ${attempt.ordinal + 1}`}
      subtitle={new Date(attempt.at).toLocaleString()}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-brass px-4 py-3 font-semibold text-zinc-950 transition hover:bg-brass-bright"
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
          <code className="mt-1 block break-all rounded-xl bg-zinc-100 px-3 py-2.5 font-mono text-base text-zinc-900">
            {attempt.value}
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
 * The upsell, stated as a fact rather than a nag.
 *
 * It appears once per opened attempt and says exactly what the purchase does,
 * including that it applies backwards — which is the part that makes it worth
 * buying two hundred attempts in rather than never.
 */
function LockedBreakdown() {
  const powerUp = POWER_UPS.breakdown;
  return (
    <div className="flex gap-3 border-t border-zinc-100 pt-3">
      <Lock className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900">What made up this score</p>
        <p className="mt-0.5 text-sm leading-snug text-zinc-500">
          A score is a sum, and this one could have been reached several ways.{" "}
          <strong className="text-zinc-700">{powerUp.name}</strong> (
          {formatNaira(powerUp.priceKobo)}) splits every attempt into exact hits,
          wrong-case hits and characters that are in there somewhere else — the
          ones you&apos;ve already made included.
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
    <div className="flex gap-3 border-t border-zinc-100 pt-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="mt-0.5 text-sm leading-snug text-zinc-500">{body}</p>
      </div>
    </div>
  );
}

function Dot({ tone }: { tone: string }) {
  return <span className={`block size-3.5 rounded-full ${tone}`} aria-hidden />;
}
