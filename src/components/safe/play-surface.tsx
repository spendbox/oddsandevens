"use client";

// One box, hunted — and the screen is the room it happens in.
//
// The server is the only thing that knows the password. It never leaves
// Postgres, so this component decides nothing about a guess: it collects
// characters, spends a life, and re-renders whatever comes back. Every mutation
// returns a whole fresh view for exactly that reason — there is no local model
// of the game to drift out of step.
//
// Everything else about the screen is arrangement, and the arrangement is:
//
//   the scene   fills the viewport, behind everything. Sky, floor, chamber,
//               door, and Boxy hauling on the wheel.
//   the rail    floats over the top of it: hunters, attempts, the score to
//               beat, the difficulty, and the way out.
//   the button  floats over the bottom. One of them, and it says "Crack the
//               safe". The field it used to be lives in a dialog now.
//   the dock    floats in the corner: your attempts, the shelf, your best.
//
// Nothing is stacked down a page any more, because there is no page — the
// scene is the whole surface and every control sits on top of it. That is the
// difference between a game and a form with a picture at the top of it.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, Palette, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { LIVES_MAX } from "@/lib/constants";
import { EMPTY_REVEALED } from "@/lib/game/power-ups";
import { formatNaira } from "@/lib/game/rewards";
import type { AttemptRecord, AttemptResult, PlayView } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { usePlayer } from "@/components/player/player-context";
import { VerifyDialog } from "@/components/player/account-dialog";
import { BuyLivesDialog } from "@/components/player/buy-lives-dialog";
import { LivesBadge, countdown, useNow } from "@/components/player/lives-badge";
import { HowItWorksDialog } from "@/components/how-it-works";
import { AttemptLog } from "./attempt-log";
import { AttemptDialog } from "./attempt-dialog";
import { KnownPanel } from "./known-panel";
import { PowerUpShelf } from "./power-up-shelf";
import { VaultScene, type CrackerState } from "./vault-scene";
import { BestPill, SceneDock, SceneRail, type StatKind } from "./scene-hud";
import { GuessDialog } from "./guess-dialog";
import { PotDialog } from "./pot-dialog";
import { StatDialog } from "./stat-dialog";
import { ResultCard, ResultDialog, resultsMuted } from "./result-dialog";
import { Boxy } from "@/components/art/boxy";

type Outcome = "open" | "won" | "pipped";
type Sheet =
  | "none"
  | "verify"
  | "lives"
  | "rules"
  | "attempts"
  | "power-ups"
  | "best"
  | "guess"
  | "pot";

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
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("open");
  const [sheet, setSheet] = useState<Sheet>("none");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ attempt: AttemptRecord; was: number } | null>(null);
  const [jolt, setJolt] = useState(0);
  /**
   * What Boxy is doing, which is not simply a function of the state.
   *
   * `working` while a guess is in flight, then `fail` for the length of the
   * animation, then back to `idle`. It has to be its own piece of state
   * because the interesting part — the moment it did not work — is over before
   * anything else on the screen has changed.
   */
  const [cracker, setCracker] = useState<CrackerState>("idle");
  /** Which rail figure somebody has asked about. */
  const [stat, setStat] = useState<StatKind | null>(null);

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
  const latest = attempts[0]?.scorePercent ?? 0;
  const best = view.hunt && attempts.length > 0 ? view.hunt.bestPercent : null;
  const bestAttempt = bestOf(attempts);
  const secondWind = view.powerUps.find((p) => p.kind === "second_wind") ?? null;

  const reload = useCallback(async () => {
    const res = await fetch(`/api/boxes/${slug}`, { cache: "no-store" });
    if (res.ok) setView((await res.json()) as PlayView);
    await refresh();
  }, [slug, refresh]);

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
      window.history.replaceState({}, "", `/b/${slug}`);
    }
    void settle();
    return () => {
      cancelled = true;
    };
  }, [pendingReference, reload, slug]);

  // Frustration lasts as long as the animation and then he goes back to the
  // wheel, because he has not given up and neither, presumably, have you.
  useEffect(() => {
    if (cracker !== "fail") return;
    const id = window.setTimeout(() => setCracker("idle"), 1100);
    return () => window.clearTimeout(id);
  }, [cracker]);

  function refuse(note: string) {
    setMessage(note);
    setCracker("fail");
  }

  async function submit() {
    if (!verified) {
      setSheet("verify");
      return;
    }
    if (busy || typed.length === 0) return;

    setBusy(true);
    setMessage(null);
    setCracker("working");
    setSheet("none");

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
        setCracker("idle");
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

    const was = view.hunt?.bestPercent ?? 0;
    const landed = body.hunt?.attempts?.[0] ?? null;
    const winning = body.outcome === "won";

    setView(body);
    setTyped("");
    setOutcome(body.outcome ?? "open");
    setJolt((n) => n + 1);
    setCracker(winning ? "won" : "fail");
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
      {/* The scene, behind everything. */}
      <VaultScene
        design={view.box.design}
        percent={latest}
        rewardKobo={view.box.rewardKobo}
        open={won}
        jolt={jolt}
        cracker={won ? "won" : cracker}
        onGold={() => setSheet("pot")}
      />

      {/* Everything else floats on top of it. `pointer-events-none` on the
          column and back on for each control, so the gold underneath stays
          tappable through the gaps. */}
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col justify-between gap-3 p-3">
        <div className="pointer-events-auto mx-auto w-full max-w-2xl space-y-2">
          <SceneRail
            box={view.box}
            onExplain={() => setSheet("rules")}
            onBack={() => router.push("/")}
            onReward={() => setSheet("pot")}
            onStat={setStat}
          />

          <div className="flex items-center justify-between gap-2">
            <LivesBadge onBuy={() => setSheet("lives")} />
            {best !== null && (
              <BestPill best={best} onClick={() => setSheet("best")} />
            )}
          </div>

          {/* Whatever the power-ups have bought, and whatever is running.
              Renders nothing at all until there is something to say. */}
          <KnownPanel revealed={revealed} now={now} />

          <div className="flex flex-wrap gap-2">
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
            {message && <Chip tone="brass">{message}</Chip>}
          </div>
        </div>

        <div className="pointer-events-auto mx-auto w-full max-w-md space-y-3">
          {outcome !== "open" && <Verdict outcome={outcome} view={view} />}

          {result && !won && (
            <ResultCard
              attempt={result.attempt}
              previousBest={result.was}
              onClose={() => setResult(null)}
            />
          )}

          {verified ? (
            <div className="flex items-end gap-3">
              <button
                type="button"
                disabled={busy || won}
                onClick={() => setSheet("guess")}
                style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
                className="btn-chunky flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-brass px-3 py-4 text-base text-ink sm:text-lg"
              >
                <KeyRound className="size-5" aria-hidden />
                {busy ? "Trying it…" : "Crack the safe"}
              </button>

              <SceneDock
                powerUps={view.powerUps.filter((p) => p.available).length}
                onAttempts={() => setSheet("attempts")}
                onPowerUps={() => setSheet("power-ups")}
              />
            </div>
          ) : (
            <div className="sheet rounded-2xl px-4 py-4 text-center">
              <Boxy mood="sly" className="mx-auto size-14" />
              <p className="mt-1 font-black tracking-tight">Sign in to start hunting.</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-zinc-400">
                It’s free, and you get {LIVES_MAX} lives to begin with.
              </p>
              <button
                type="button"
                onClick={() => setSheet("verify")}
                style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
                className="btn-chunky mt-3 w-full rounded-2xl bg-brass px-6 py-3 text-ink"
              >
                Sign in to play
              </button>
            </div>
          )}
        </div>
      </div>

      {sheet === "guess" && (
        <GuessDialog
          value={typed}
          onChange={setTyped}
          onSubmit={() => void submit()}
          busy={busy}
          revealed={revealed}
          onClose={() => setSheet("none")}
        />
      )}

      {sheet === "pot" && (
        <PotDialog
          rewardKobo={view.box.rewardKobo}
          isChallenge={view.box.isChallenge}
          contributor={view.box.contributor}
          onClose={() => setSheet("none")}
        />
      )}

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
          secondWind={secondWind}
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

      {stat && (
        <StatDialog stat={stat} box={view.box} onClose={() => setStat(null)} />
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
  brass: "border-brass/50 bg-brass/20 text-brass",
  mint: "border-mint/50 bg-mint/20 text-mint",
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
        "animate-fade-up flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-bold backdrop-blur " +
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
