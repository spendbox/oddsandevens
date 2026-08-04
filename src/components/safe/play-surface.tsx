"use client";

// One box, hunted — as a scene rather than a form.
//
// The server is the only thing that knows the password. It never leaves
// Postgres, so this component decides nothing about a guess: it collects
// characters, spends a life, and re-renders whatever comes back. Every mutation
// returns a whole fresh view for exactly that reason — there is no local model
// of the game to drift out of step.
//
// What changed is everything around that. The screen used to be a stack of
// prose: the safe, the rules, the field, a tab bar, a log, a shelf, and enough
// explanation between them that on a phone the safe was off the top of the
// screen before you had made a single guess. A password game reads as a form
// unless something makes it a place.
//
// So the middle of the screen is the vault scene and nothing else, and every
// other thing the old page showed inline is now either a chip on the rail above
// it or a sheet behind a floating button:
//
//   the rail   difficulty, the prize, hunters, attempts, the score to beat
//   the scene  the safe, and ten locks that open as the score climbs
//   the field  one input and one button, docked under it
//   the dock   your attempts, the power-up shelf, your best guess
//
// The rule the whole layout follows is that the scene is never navigated away
// from. Everything opens over it and closes back onto it, because a hunt is one
// long session on one box and losing your place in it is the whole cost.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Palette, Sparkles } from "lucide-react";
import { LIVES_MAX } from "@/lib/constants";
import { EMPTY_REVEALED } from "@/lib/game/power-ups";
import { formatNaira } from "@/lib/game/rewards";
import type { AttemptRecord, AttemptResult, PlayView } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { usePlayer } from "@/components/player/player-context";
import { VerifyDialog } from "@/components/player/account-dialog";
import { BuyLivesDialog } from "@/components/player/buy-lives-dialog";
import { countdown, useNow } from "@/components/player/lives-badge";
import { HowItWorksDialog } from "@/components/how-it-works";
import { AttemptLog } from "./attempt-log";
import { AttemptDialog } from "./attempt-dialog";
import { KnownPanel } from "./known-panel";
import { PasswordField } from "./password-field";
import { PowerUpShelf } from "./power-up-shelf";
import { VaultScene } from "./vault-scene";
import { ResultCard, ResultDialog, resultsMuted } from "./result-dialog";
import { BestPill, SceneDock, SceneRail } from "./scene-hud";
import { Boxy } from "@/components/art/boxy";

type Outcome = "open" | "won" | "pipped";
type Sheet = "none" | "verify" | "lives" | "rules" | "attempts" | "power-ups" | "best";

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
  const [sheet, setSheet] = useState<Sheet>("none");
  const [message, setMessage] = useState<string | null>(null);
  // True for one beat when a guess is refused, so the scene can flinch.
  const [recoil, setRecoil] = useState(false);
  // The guess that has just resolved, and what their best was before it — so
  // the result can say whether this one moved anything.
  const [result, setResult] = useState<{ attempt: AttemptRecord; was: number } | null>(null);
  // Counts guesses that reached the server. Handed to the scene so all ten
  // bolts take the hit, whether or not any of them give way.
  const [jolt, setJolt] = useState(0);
  // Ticks while anything on screen is counting down: a life, Colour Read's 24
  // hours, or a Second Wind hour.
  const now = useNow(
    view.player.nextLifeAt ??
      view.hunt?.secondWindUntil ??
      view.hunt?.breakdownUntil ??
      null
  );

  const open = view.box.status === "live";
  const revealed = view.hunt?.revealed ?? EMPTY_REVEALED;
  const won = view.hunt?.won ?? false;
  const freeRun =
    !!view.hunt?.secondWindUntil &&
    new Date(view.hunt.secondWindUntil).getTime() > now;

  const attempts = view.hunt?.attempts ?? [];
  /**
   * The score the locks are showing: the most recent guess.
   *
   * The *latest* rather than the best, deliberately. The locks are feedback on
   * what you just did — a guess that goes backwards should visibly take locks
   * away, or the scene is congratulating you for getting colder. Your best is
   * on the dock, where it can't be lost.
   */
  const latest = attempts[0]?.scorePercent ?? 0;
  const best = view.hunt && attempts.length > 0 ? view.hunt.bestPercent : null;
  const bestAttempt = bestOf(attempts);

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

  function refuse(note: string) {
    setMessage(note);
    setRecoil(true);
  }

  // Clears itself once the animation has run, so the class comes off and the
  // next refusal re-triggers it. 550ms is the keyframe plus a frame.
  useEffect(() => {
    if (!recoil) return;
    const id = window.setTimeout(() => setRecoil(false), 550);
    return () => window.clearTimeout(id);
  }, [recoil]);

  async function submit() {
    if (!verified) {
      setSheet("verify");
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
        refuse(
          body.nextLifeAt
            ? `Out of lives. The next one lands in ${countdown(body.nextLifeAt, Date.now())}.`
            : "Out of lives for now."
        );
        setSheet("lives");
        return;
      }
      if (body.error === "not_verified") {
        setSheet("verify");
        return;
      }
      refuse(
        body.error === "box_unlocked"
          ? "Somebody opened this one while you were typing."
          : "That guess didn't go through."
      );
      return;
    }

    // Captured before the new view lands, because the point of the result is
    // the comparison and the new view already contains the answer.
    const was = view.hunt?.bestPercent ?? 0;
    const landed = body.hunt?.attempts?.[0] ?? null;

    setView(body);
    setTyped("");
    setOutcome(body.outcome ?? "open");
    setJolt((n) => n + 1);
    if (landed && !resultsMuted()) setResult({ attempt: landed, was });
    await refresh();
  }

  if (!open) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <Cracked view={view} />
      </div>
    );
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 px-4 pb-4 pt-3 sm:gap-4 sm:pb-6">
        <SceneRail box={view.box} onExplain={() => setSheet("rules")} />

        {/* The dock floats over the scene rather than the viewport. Fixed to
            the window it would end up behind a phone keyboard the moment
            somebody starts typing, which is exactly when they want it. */}
        {/*
          The scene takes every pixel between the rail and the field. On a tall
          phone that is most of the screen, which is the point — this is the
          game, and it was previously a 19rem box with the page's whitespace
          above and below it.
        */}
        <div className="relative flex min-h-[17rem] flex-1 flex-col">
          <VaultScene
            className="flex-1"
            design={view.box.design}
            percent={latest}
            recoil={recoil}
            open={won}
            jolt={jolt}
          />

          {/* The result, laid over the bottom of the scene rather than over
              the whole screen. The bolts it is describing stay visible. */}
          {result && !won && (
            <div className="absolute inset-x-3 bottom-3 z-30">
              <ResultCard
                attempt={result.attempt}
                previousBest={result.was}
                onClose={() => setResult(null)}
              />
            </div>
          )}
          {verified && (
            <>
              {best !== null && (
                <BestPill
                  className="absolute right-3 top-3"
                  best={best}
                  onClick={() => setSheet("best")}
                />
              )}
              <SceneDock
                className={
                  "absolute bottom-3 right-3 transition-opacity duration-200 " +
                  (result && !won ? "pointer-events-none opacity-0" : "opacity-100")
                }
                powerUps={view.powerUps.filter((p) => p.available).length}
                onAttempts={() => setSheet("attempts")}
                onPowerUps={() => setSheet("power-ups")}
              />
            </>
          )}
        </div>

        {outcome !== "open" && <Verdict outcome={outcome} view={view} />}

        {/*
          Three things can need saying at once — a refused guess, a Second Wind
          hour, a Colour Read window — and each used to be its own bordered
          paragraph stacked down the page. They are one row of chips now, and
          they wrap.
        */}
        {(message || freeRun || view.hunt?.hasBreakdown) && (
          <div className="flex flex-wrap justify-center gap-2">
            {message && (
              <Chip tone="brass">{message}</Chip>
            )}
            {freeRun && view.hunt?.secondWindUntil && (
              <Chip tone="mint">
                <Sparkles className="size-3.5" aria-hidden />
                Free guesses · {countdown(view.hunt.secondWindUntil, now)}
              </Chip>
            )}
            {view.hunt?.hasBreakdown && view.hunt.breakdownUntil && (
              <Chip tone="brass">
                <Palette className="size-3.5" aria-hidden />
                Colour Read · {countdown(view.hunt.breakdownUntil, now)}
              </Chip>
            )}
          </div>
        )}

        {/* Whatever the power-ups have bought, when there is any. Renders
            nothing at all until something has been revealed. */}
        <KnownPanel revealed={revealed} now={now} />

        {outcome === "open" && (
          <PasswordField
            value={typed}
            onChange={setTyped}
            onSubmit={() => void submit()}
            disabled={won}
            busy={busy}
            revealed={revealed}
            livesLeft={view.player.lives}
            freeRun={freeRun}
          />
        )}

        {!freeRun && view.player.lives === 0 && view.player.nextLifeAt && (
          <p className="text-center text-sm text-zinc-400">
            Next life in{" "}
            <span className="font-mono text-brass">
              {countdown(view.player.nextLifeAt, now)}
            </span>
            {" · "}
            <button
              type="button"
              onClick={() => setSheet("lives")}
              className="underline hover:text-foreground"
            >
              buy some
            </button>
          </p>
        )}

        {/*
          Signed out, the dock would be an empty log and a shelf you cannot buy
          from. It's the reason to sign in instead.
        */}
        {!verified && (
          <div className="panel rounded-2xl px-4 py-5 text-center">
            <Boxy mood="sly" className="mx-auto size-16" />
            <p className="mt-1 font-black tracking-tight">Sign in to start hunting.</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-zinc-400">
              Your guesses and your power-ups live with your account. It’s free,
              and you get {LIVES_MAX} lives to begin with.
            </p>
            <button
              type="button"
              onClick={() => setSheet("verify")}
              style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
              className="btn-chunky mt-4 rounded-2xl bg-brass px-6 py-3 text-ink"
            >
              Sign in to play
            </button>
          </div>
        )}
      </div>

      {sheet === "verify" && (
        <VerifyDialog
          onClose={() => {
            setSheet("none");
            void reload();
          }}
        />
      )}
      {sheet === "lives" && (
        <BuyLivesDialog
          slug={slug}
          contributor={view.box.contributor}
          onClose={() => setSheet("none")}
        />
      )}
      {sheet === "rules" && <HowItWorksDialog onClose={() => setSheet("none")} />}

      {sheet === "attempts" && (
        <Modal
          title="Your attempts"
          subtitle={`${view.hunt?.attemptsCount ?? 0} so far on this safe`}
          width="lg"
          onClose={() => setSheet("none")}
        >
          <AttemptLog attempts={attempts} />
          {view.hunt && view.hunt.attemptsCount > attempts.length && (
            <p className="mt-2 text-center text-xs text-zinc-500">
              Showing your last {attempts.length} of {view.hunt.attemptsCount}.
            </p>
          )}
        </Modal>
      )}

      {sheet === "power-ups" && (
        <Modal
          title="Power-ups"
          subtitle="Each one buys back something the game is keeping from you."
          width="lg"
          onClose={() => setSheet("none")}
        >
          <PowerUpShelf view={view} slug={slug} disabled={won} now={now} />
        </Modal>
      )}

      {sheet === "best" && bestAttempt && (
        <AttemptDialog attempt={bestAttempt} onClose={() => setSheet("none")} />
      )}

      {result && won && (
        <ResultDialog
          attempt={result.attempt}
          previousBest={result.was}
          won
          onClose={() => setResult(null)}
        />
      )}
    </>
  );
}

/** The highest-scoring attempt on the page, or null before there is one. */
function bestOf(attempts: AttemptRecord[]): AttemptRecord | null {
  if (attempts.length === 0) return null;
  return attempts.reduce((top, a) => (a.scorePercent > top.scorePercent ? a : top));
}

const CHIP_TONES = {
  brass: "border-brass/50 bg-brass/15 text-brass",
  mint: "border-mint/50 bg-mint/15 text-mint",
} as const;

function Chip({
  tone,
  children,
}: {
  tone: keyof typeof CHIP_TONES;
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        "animate-fade-up flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-center text-xs font-bold " +
        CHIP_TONES[tone]
      }
    >
      {children}
    </span>
  );
}

function Verdict({ outcome, view }: { outcome: Outcome; view: PlayView }) {
  if (outcome === "won") {
    return (
      <div className="panel animate-unlock rounded-3xl border-brass/50 p-5 text-center">
        <Boxy mood="cheer" className="mx-auto size-24" />
        <p className="mt-1 text-2xl font-black tracking-tight">The safe is open!</p>
        <p className="mt-1 text-sm text-zinc-300">
          {view.box.isChallenge ? (
            <>You cracked it. No money behind this one — just the fact that you did it.</>
          ) : (
            <>
              {formatNaira(view.box.rewardKobo)} is yours. We’ve emailed you —{" "}
              <Link href="/me" className="text-brass underline">
                add your bank account
              </Link>{" "}
              and we’ll send it.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="panel rounded-3xl p-5 text-center">
      <Boxy mood="sad" className="mx-auto size-20" />
      <p className="mt-1 text-sm text-zinc-300">
        You got the password — but somebody else submitted it first, seconds
        ago. The box is closed.
      </p>
    </div>
  );
}

/**
 * A box that's over.
 *
 * This was four lines of grey text and a link, which is a strange way to end a
 * story somebody may have spent a fortnight inside. It's a result screen now:
 * the safe hanging open, the money that came out of it, who took it and how
 * long it took everybody — and then, because the only useful thing left to do
 * is find another one, a button that does that.
 */
function Cracked({ view }: { view: PlayView }) {
  const { box } = view;
  const taken = box.status === "unlocked";

  return (
    <div className="space-y-4">
      <div className="panel relative overflow-hidden rounded-3xl p-6 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brass/15 blur-3xl"
        />

        <Boxy mood={taken ? "cheer" : "sad"} className="mx-auto size-28" />

        <p className="mt-1 text-2xl font-black tracking-tight">
          {taken ? "This one's been cracked." : "This one's closed."}
        </p>

        {taken ? (
          <>
            {!box.isChallenge && (
              <p className="brass-text mt-3 text-5xl font-black tabular-nums">
                {formatNaira(box.rewardKobo)}
              </p>
            )}
            <p className="mt-1 text-sm text-zinc-300">
              {box.isChallenge ? "Cracked by" : "went to"}{" "}
              <span className="font-mono font-bold text-brass">
                {box.unlockedBy ?? "a player"}
              </span>
            </p>

            <dl className="mt-5 grid grid-cols-3 gap-2">
              <Figure label="Hunters" value={String(box.playersCount)} />
              <Figure label="Attempts" value={box.attemptsCount.toLocaleString("en-NG")} />
              <Figure
                label="Cracked"
                value={
                  box.unlockedAt
                    ? new Date(box.unlockedAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })
                    : "—"
                }
              />
            </dl>

            <p className="mt-4 text-sm text-zinc-400">
              An opened safe can never be played again. Every reward on Spendbox
              is real money and goes to whoever opens the box.
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">
            It was withdrawn from play, so nothing more can be won here.
          </p>
        )}
      </div>

      <Link
        href="/"
        style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
        className="btn-chunky flex w-full items-center justify-center gap-2 rounded-2xl bg-brass px-6 py-4 text-lg text-ink"
      >
        Find another safe
        <ArrowRight className="size-5" aria-hidden />
      </Link>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-black/25 px-2 py-3">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-lg font-black">{value}</dd>
    </div>
  );
}
