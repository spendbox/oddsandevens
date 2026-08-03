"use client";

// One box, hunted.
//
// The server is the only thing that knows the password — it never leaves
// Postgres — so this component decides nothing about a guess. It collects
// characters, spends a life, and re-renders whatever comes back. Every
// mutation returns a whole fresh view for exactly that reason: there is no
// local model of the game to drift out of step.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LockOpen, MoveDown, MoveUp, Palette, Swords, Target, Trophy, Users } from "lucide-react";
import { ScorePill } from "./score-pill";
import { LIVES_MAX } from "@/lib/constants";
import { plural } from "@/lib/plural";
import { EMPTY_REVEALED } from "@/lib/game/power-ups";
import { formatNaira, rewardLabel } from "@/lib/game/rewards";
import type { AttemptResult, PlayView } from "@/lib/types";
import { usePlayer } from "@/components/player/player-context";
import { VerifyDialog } from "@/components/player/verify-dialog";
import { BuyLivesDialog } from "@/components/player/buy-lives-dialog";
import { countdown, useNow } from "@/components/player/lives-badge";
import { DifficultyBadge } from "@/components/difficulty-badge";
import { AttemptLog } from "./attempt-log";
import { KnownPanel } from "./known-panel";
import { PasswordField } from "./password-field";
import { PowerUpShelf } from "./power-up-shelf";

type Outcome = "open" | "won" | "pipped";

export function PlaySurface({
  initial,
  slug,
  /** A Paystack reference we've just come back from, if any. */
  pendingReference,
}: {
  initial: PlayView;
  slug: string;
  pendingReference: string | null;
}) {
  const { refresh, verified } = usePlayer();
  const [view, setView] = useState(initial);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("open");
  const [dialog, setDialog] = useState<"none" | "verify" | "lives">("none");
  const [message, setMessage] = useState<string | null>(null);
  // Ticks while either a life or the Colour Read window is counting down.
  const now = useNow(view.player.nextLifeAt ?? view.hunt?.breakdownUntil ?? null);

  const open = view.box.status === "live";
  const revealed = view.hunt?.revealed ?? EMPTY_REVEALED;

  const reload = useCallback(async () => {
    const res = await fetch(`/api/boxes/${slug}`, { cache: "no-store" });
    if (res.ok) setView((await res.json()) as PlayView);
    await refresh();
  }, [slug, refresh]);

  /**
   * Settle the payment we've just been redirected back from.
   *
   * Paystack's webhook will settle it too, but it can land after the browser
   * does, and a player who has just paid for a hint should not be looking at
   * the state they left. Whichever gets there first wins; both are idempotent.
   */
  useEffect(() => {
    if (!pendingReference) return;
    let cancelled = false;
    async function settle() {
      const res = await fetch("/api/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: pendingReference }),
      });
      const body = (await res.json().catch(() => ({}))) as { note?: string };
      if (cancelled) return;
      if (body.note) setMessage(body.note);
      await reload();
      // Drop the reference from the URL so a refresh doesn't re-verify it.
      window.history.replaceState({}, "", `/b/${slug}`);
    }
    void settle();
    return () => {
      cancelled = true;
    };
  }, [pendingReference, reload, slug]);

  async function submit() {
    if (!verified) {
      setDialog("verify");
      return;
    }
    if (busy || typed.length === 0) return;

    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/boxes/${slug}/attempt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guess: typed }),
    });
    const body = (await res.json().catch(() => ({}))) as AttemptResult & {
      error?: string;
      nextLifeAt?: string;
    };
    setBusy(false);

    if (!res.ok) {
      if (body.error === "no_lives") {
        setMessage(
          body.nextLifeAt
            ? `Out of lives. The next one lands in ${countdown(body.nextLifeAt, Date.now())}.`
            : "Out of lives for now."
        );
        setDialog("lives");
        return;
      }
      if (body.error === "not_verified") {
        setDialog("verify");
        return;
      }
      setMessage(
        body.error === "box_unlocked"
          ? "Somebody opened this one while you were typing."
          : "That guess didn't go through."
      );
      return;
    }

    setView(body);
    setTyped("");
    setOutcome(body.outcome ?? "open");
    await refresh();
  }

  return (
    <>
      <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
        <BoxHeader view={view} />

        {!open ? (
          <Cracked view={view} />
        ) : (
          <>
            {outcome !== "open" && <Verdict outcome={outcome} view={view} />}

            {message && (
              <p className="rounded-xl border border-brass/30 bg-brass/10 px-3 py-2.5 text-center text-sm text-brass">
                {message}
              </p>
            )}

            {view.hunt?.hasBreakdown && view.hunt.breakdownUntil && (
              <p className="flex flex-wrap items-center justify-center gap-x-2 rounded-xl border border-brass/30 bg-brass/10 px-3 py-2 text-center text-xs text-brass">
                <Palette className="size-3.5" aria-hidden />
                Colour Read is on — every score is split into its parts for another{" "}
                <span className="font-mono">
                  {countdown(view.hunt.breakdownUntil, now)}
                </span>
              </p>
            )}

            <KnownPanel revealed={revealed} />

            {outcome === "open" && (
              <PasswordField
                value={typed}
                onChange={setTyped}
                onSubmit={() => void submit()}
                disabled={view.hunt?.won ?? false}
                busy={busy}
                revealed={revealed}
                livesLeft={view.player.lives}
              />
            )}

            {view.player.lives === 0 && view.player.nextLifeAt && (
              <p className="text-center text-sm text-zinc-400">
                Next life in{" "}
                <span className="font-mono text-brass">
                  {countdown(view.player.nextLifeAt, now)}
                </span>
                {" · "}
                <button
                  type="button"
                  onClick={() => setDialog("lives")}
                  className="underline hover:text-zinc-200"
                >
                  or buy some
                </button>
              </p>
            )}

            <Rules />

            <section className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                  Your attempts
                </h2>
                {view.hunt && view.hunt.attemptsCount > 0 && (
                  <span className="flex items-center gap-2 text-xs text-zinc-500">
                    <span className="font-mono">
                      {plural(view.hunt.attemptsCount, "attempt")}
                    </span>
                    <span>best</span>
                    <ScorePill percent={view.hunt.bestPercent} />
                  </span>
                )}
              </div>
              <AttemptLog attempts={view.hunt?.attempts ?? []} />
              {view.hunt && view.hunt.attemptsCount > (view.hunt.attempts.length ?? 0) && (
                <p className="text-center text-xs text-zinc-600">
                  Showing your last {view.hunt.attempts.length} of{" "}
                  {view.hunt.attemptsCount}.
                </p>
              )}
            </section>

            <PowerUpShelf view={view} slug={slug} disabled={view.hunt?.won ?? false} />
          </>
        )}
      </div>

      {dialog === "verify" && (
        <VerifyDialog
          onClose={() => {
            setDialog("none");
            void reload();
          }}
        />
      )}
      {dialog === "lives" && <BuyLivesDialog onClose={() => setDialog("none")} />}
    </>
  );
}

function BoxHeader({ view }: { view: PlayView }) {
  const { box } = view;
  return (
    <header className="space-y-2 text-center">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        {box.kind === "general" ? "The public box" : `Put up by ${box.contributor}`}
      </p>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{box.title}</h1>
      {box.blurb && <p className="text-sm text-zinc-400">{box.blurb}</p>}

      <p
        className={
          "font-black tabular-nums " +
          (box.isChallenge ? "text-2xl text-zinc-300" : "brass-text text-4xl sm:text-5xl")
        }
      >
        {rewardLabel(box.rewardKobo)}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <DifficultyBadge difficulty={box.difficulty} />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden />
          {plural(box.playersCount, "hunter")}
        </span>
        <span className="flex items-center gap-1.5">
          <Swords className="size-3.5" aria-hidden />
          {plural(box.attemptsCount, "attempt")} so far
        </span>
      </div>
    </header>
  );
}

/** The rules, restated where they're needed rather than on a help page. */
function Rules() {
  return (
    <details className="panel rounded-2xl px-4 py-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-400">
        How a guess is marked
      </summary>
      <ul className="mt-3 space-y-2 text-sm text-zinc-400">
        <li className="flex gap-2">
          <MoveUp className="mt-0.5 size-4 shrink-0 text-sky-300" aria-hidden />
          <span>
            <strong className="text-zinc-200">Up arrow — add characters.</strong>{" "}
            Your guess was shorter than the password.
          </span>
        </li>
        <li className="flex gap-2">
          <MoveDown className="mt-0.5 size-4 shrink-0 text-sky-300" aria-hidden />
          <span>
            <strong className="text-zinc-200">Down arrow — remove characters.</strong>{" "}
            Your guess was longer than the password.
          </span>
        </li>
        <li className="flex gap-2">
          <Target className="mt-0.5 size-4 shrink-0 text-mark-green" aria-hidden />
          <span>
            <strong className="text-zinc-200">Target — right length.</strong> Exactly
            as many characters as the password. Nothing tells you the number until
            you find it.
          </span>
        </li>
        <li>
          <strong className="text-zinc-200">A score out of 100.</strong> How close
          the guess is. Every position contributes something — an exact character
          most, the right letter in the wrong case least, a character that&apos;s in
          the password but somewhere else in between — and the total is measured
          against a perfect guess.{" "}
          <strong className="text-brass">100% is the password itself</strong>, and
          nothing else reaches it.
        </li>
        <li className="text-zinc-500">
          How much each of those is worth is not published. Two very different
          guesses can score the same, and working out which explanation fits is
          the game.
        </li>
        <li className="text-zinc-500">
          Case counts. <span className="font-mono">k</span> and{" "}
          <span className="font-mono">K</span> are different characters.
        </li>
        <li className="text-zinc-500">
          Tap any attempt in the log to read it in full.
        </li>
      </ul>
    </details>
  );
}

function Verdict({ outcome, view }: { outcome: Outcome; view: PlayView }) {
  if (outcome === "won") {
    return (
      <div className="panel animate-unlock rounded-2xl border-brass/40 p-5 text-center">
        <Trophy className="mx-auto size-10 text-brass" aria-hidden />
        <p className="mt-2 text-lg font-bold">The safe is open.</p>
        <p className="mt-1 text-sm text-zinc-400">
          {view.box.isChallenge ? (
            <>You cracked it. No money behind this one — just the fact that you did it.</>
          ) : (
            <>
              {formatNaira(view.box.rewardKobo)} is yours. We&apos;ve emailed you —{" "}
              <Link href="/me" className="text-brass underline">
                add your bank account
              </Link>{" "}
              and we&apos;ll send it.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="panel rounded-2xl p-4 text-center text-sm text-zinc-300">
      You got the password — but somebody else submitted it first, seconds ago.
      The box is closed.
    </div>
  );
}

function Cracked({ view }: { view: PlayView }) {
  return (
    <div className="panel rounded-2xl p-6 text-center">
      <LockOpen className="mx-auto size-10 text-brass" aria-hidden />
      <p className="mt-3 text-lg font-bold">
        {view.box.status === "unlocked" ? "This one's been opened." : "This one's closed."}
      </p>
      <p className="mt-1 text-sm text-zinc-400">
        {view.box.status === "unlocked" ? (
          <>
            {view.box.unlockedBy ?? "A player"} guessed the password
            {view.box.isChallenge ? "" : ` and took ${formatNaira(view.box.rewardKobo)}`}
            {view.box.attemptsCount > 0 && (
              <> after {plural(view.box.attemptsCount, "attempt")} across everyone</>
            )}
            . An opened box can&apos;t be played again.
          </>
        ) : (
          <>It was withdrawn from play.</>
        )}
      </p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-xl bg-brass px-5 py-2.5 font-semibold text-zinc-950 transition hover:bg-brass-bright"
      >
        Find another safe
      </Link>
    </div>
  );
}

export { LIVES_MAX };
