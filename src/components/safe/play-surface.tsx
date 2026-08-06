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

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, Lightbulb, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { LIVES_MAX } from "@/lib/constants";
import { EMPTY_REVEALED, POWER_UPS, secondWindLabel } from "@/lib/game/power-ups";
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
import { KnownDialog, knowsAnything } from "./known-panel";
import { PowerUpShelf } from "./power-up-shelf";
import { ChaseScene } from "./chase-scene";
import type { Shot } from "@/lib/game/chase";
import { SceneDock, SceneRail, type StatKind } from "./scene-hud";
import { GuessDialog } from "./guess-dialog";
import { PotDialog } from "./pot-dialog";
import { StatDialog } from "./stat-dialog";
import { ResultCard, ResultDialog } from "./result-dialog";
import { DropCrate } from "./drop-crate";
import { useDrops } from "./use-drops";
import type { Rival } from "@/lib/types";
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
  | "known"
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
  // `was` is their best before this guess; `before` is the guess immediately
  // before it. Both, because "up on your best" and "up on your last" are
  // different pieces of news and the reaction wants the second one.
  const [result, setResult] = useState<{
    attempt: AttemptRecord;
    was: number;
    before: number | null;
  } | null>(null);
  const [jolt, setJolt] = useState(0);
  /**
   * What the last shot did.
   *
   * A hit is a guess that beat your own best, because that is the only thing
   * that adds damage — so it is the only thing the gun is allowed to land.
   */
  const [shot, setShot] = useState<Shot>("miss");
  /** Which rail figure somebody has asked about. */
  const [stat, setStat] = useState<StatKind | null>(null);
  /** Whose car has been tapped. */
  const [rival, setRival] = useState<Rival | null>(null);
  /**
   * Guesses in a row that failed to beat your own best.
   *
   * The signal a drop is aimed at. A player five guesses into a cold run is
   * the one about to close the tab.
   */
  const [coldStreak, setColdStreak] = useState(0);
  /** Bumped when somebody else's guess lands on this safe. */
  const [rivalShot, setRivalShot] = useState(0);

  /**
   * The stack above the button, and the reason it is a ref.
   *
   * A verdict, a gift crate and the result of the guess you just made all
   * queue up in one short scroller, and on a small screen they do not all fit.
   * A scroller sitting at the top shows the *oldest* of them — so a crate that
   * arrived ten minutes ago was holding the slot and the answer to the guess
   * just made was below the fold, unread and gone 2.6 seconds later.
   *
   * The newest thing is always the one worth seeing, and it is always last, so
   * the scroller is pinned to its bottom whenever the contents change.
   */
  const stack = useRef<HTMLDivElement>(null);

  const now = useNow(
    view.player.nextLifeAt ??
      view.discount?.expiresAt ??
      view.hunt?.secondWindUntil ??
      view.hunt?.breakdownUntil ??
      null
  );

  /**
   * A discount the player is holding, while it is still worth anything.
   *
   * Checked against the ticking clock rather than trusted from the payload, so
   * it disappears from the screen at the same second the checkout stops
   * honouring it — a chip promising 40% off that the till then refuses is
   * worse than never having offered it.
   */
  const discount =
    view.discount && new Date(view.discount.expiresAt).getTime() > now
      ? view.discount
      : null;

  const open = view.box.status === "live";
  const revealed = view.hunt?.revealed ?? EMPTY_REVEALED;
  const won = view.hunt?.won ?? false;

  const attempts = view.hunt?.attempts ?? [];
  const best = view.hunt && attempts.length > 0 ? view.hunt.bestPercent : null;
  const bestAttempt = bestOf(attempts);
  const secondWind = view.powerUps.find((p) => p.kind === "second_wind") ?? null;

  const drops = useDrops({
    slug,
    lives: view.player.lives,
    coldStreak,
    // Only what's still on sale here: a discount on something already bought
    // is a gift of nothing, and it would take a slot in the rotation.
    powerUps: view.powerUps.filter((p) => p.available).map((p) => p.kind),
    initial: view.offer,
    enabled: verified && open && !won,
  });

  const reload = useCallback(async () => {
    const res = await fetch(`/api/boxes/${slug}`, { cache: "no-store" });
    if (res.ok) setView((await res.json()) as PlayView);
    await refresh();
  }, [slug, refresh]);

  const drop = drops.drop;
  useEffect(() => {
    const el = stack.current;
    if (!el) return;
    // After paint, so the height being scrolled to is the new one.
    const id = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [drop, result, outcome]);

  /*
   * The golden chip takes itself away.
   *
   * It says things like "+2 free lives" and "40% off — it's on the shelf", and
   * it used to be cleared only by the *next* guess. So a player who claimed a
   * gift and then sat reading the shelf kept a stale notice under their life
   * badge until they reloaded — still advertising an offer that had by then
   * expired. Six seconds is long enough to read a five-word chip.
   */
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => setMessage(null), 6_000);
    return () => window.clearTimeout(id);
  }, [message]);

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

  /**
   * Watch for other people's guesses.
   *
   * The box's attempt count is the only thing that moves when a stranger
   * plays, so that is what this polls. When it rises, somebody else has taken
   * a shot at the same safe and the scene fires one — the safe is shared, and
   * a chase where only your car ever shoots is not a chase.
   */
  useEffect(() => {
    if (!open || won) return;
    let seen = view.box.attemptsCount;
    const id = window.setInterval(async () => {
      const res = await fetch(`/api/boxes/${slug}`, { cache: "no-store" });
      if (!res.ok) return;
      const fresh = (await res.json()) as PlayView;
      if (fresh.box.attemptsCount > seen) {
        seen = fresh.box.attemptsCount;
        setRivalShot((n) => n + 1);
        setView((current) => ({ ...current, box: fresh.box, rivals: fresh.rivals }));
      }
    }, 20_000);
    return () => window.clearInterval(id);
    // Deliberately not depending on `view` — this is a background watcher and
    // re-arming it on every render would poll far harder than every 20s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, open, won]);

  function refuse(note: string) {
    setMessage(note);
    setShot("miss");
    setJolt((n) => n + 1);
  }

  async function submit() {
    if (!verified) {
      setSheet("verify");
      return;
    }
    if (busy || typed.length === 0) return;

    setBusy(true);
    setMessage(null);
    setSheet("none");
    // Put the keyboard away *before* anything else can open.
    //
    // Unmounting the field is not enough on iOS — Safari will happily keep the
    // keyboard up after its input has gone — and the sheet that most often
    // follows a guess is the out-of-lives one, which then arrives behind the
    // keys with its buttons unreachable. An explicit blur is the only thing
    // that reliably retracts it.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

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

    const was = view.hunt?.bestPercent ?? 0;
    // The log is newest-first and hasn't been replaced yet, so its head is the
    // guess before this one. Null on the first of a hunt, where "you went down"
    // has nothing to be down from.
    const before = view.hunt?.attempts?.[0]?.scorePercent ?? null;
    const landed = body.hunt?.attempts?.[0] ?? null;
    const winning = body.outcome === "won";

    // The shot and the sheet go up together. Nothing about the animation gates
    // the answer — a player firing off guesses should never wait for a bullet.
    setView(body);
    setTyped("");
    setOutcome(body.outcome ?? "open");
    const improved = !!landed && landed.scorePercent > was;
    setShot(winning || improved ? "hit" : "miss");
    setColdStreak((n) => (improved || winning ? 0 : n + 1));
    setJolt((n) => n + 1);
    if (landed) setResult({ attempt: landed, was, before });
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
      {/* The chase, behind everything. Damage tracks your *best*, not your
          last — the safe does not heal because you tried something worse. */}
      <ChaseScene
        design={view.box.design}
        percent={best ?? 0}
        jolt={jolt}
        shot={shot}
        open={won}
        onSafe={() => setSheet("pot")}
        rivals={view.rivals}
        onRival={setRival}
        rivalShot={rivalShot}
      />

      {/* Everything else floats on top of it. `pointer-events-none` on the
          column and back on for each control, so the gold underneath stays
          tappable through the gaps. */}
      {/* `min-h-0` so this column can be shorter than its content rather than
          pushing the surface past the viewport, and the bottom padding clears
          the home indicator on a phone that has one. */}
      <div className="pointer-events-none relative z-10 flex min-h-0 flex-1 flex-col justify-between gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto mx-auto w-full max-w-2xl shrink-0 space-y-2">
          <SceneRail
            box={view.box}
            bestGuess={bestAttempt?.value ?? null}
            yourBest={best}
            onExplain={() => setSheet("rules")}
            onBack={() => router.push("/")}
            onReward={() => setSheet("pot")}
            onStat={setStat}
            onBestGuess={() => setSheet("best")}
          />

          <div className="flex items-center justify-between gap-2">
            <LivesBadge onBuy={() => setSheet("lives")} />

            {/* Opposite the lives, under the stats: one icon, no label. It is
                a reading you check occasionally, and it belongs at the top with
                the other readings rather than down among the controls. */}
            <button
              type="button"
              onClick={() => setSheet("known")}
              aria-label="Active boosters"
              className="relative flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-white/15 bg-background/85 text-zinc-200 transition hover:border-mint/60 hover:text-mint"
            >
              <Lightbulb className="size-4" aria-hidden />
              {knowsAnything(revealed, now) && (
                <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-mint" />
              )}
            </button>
          </div>

          <div className="flex items-center justify-end gap-2">
            {/* What you're holding, and how long you have to spend it. It goes
                to the shelf on a tap, because a discount you have to go and
                find is a discount that expires unused. */}
            {discount && (
              <button
                type="button"
                onClick={() => setSheet("power-ups")}
                className="flex items-center gap-1.5 rounded-full border-2 border-grape/60 bg-background/85 py-1 pl-2.5 pr-3 text-xs font-black text-grape shadow-lg backdrop-blur transition hover:border-grape"
              >
                <Tag className="size-3.5" aria-hidden />
                {discount.amount}% off{" "}
                {POWER_UPS[discount.powerUp as keyof typeof POWER_UPS]?.name ?? "a power-up"}
                <span className="font-mono tabular-nums text-zinc-300">
                  {countdown(discount.expiresAt, now)}
                </span>
              </button>
            )}
          </div>

          {/*
            What used to be here: a standing "what you know" panel and a row of
            chips for whatever was running. Both were the pre-scene layout, and
            both appeared the moment anybody bought anything — so spending money
            was rewarded with the old UI stacked over the game. They live in the
            Known sheet now, behind the dock, with the countdowns in it.
          */}
          {message && (
            <div className="flex flex-wrap gap-2">
              <Chip tone="brass">{message}</Chip>
            </div>
          )}
        </div>

        {/*
          Two stacks, and the split is about clipping.

          Everything above the button — a verdict, a crate, a result card — can
          outgrow a short phone, so it scrolls. The buttons must never be in
          that scroller: `overflow-y: auto` computes `overflow-x` to `auto` as
          well, which makes the box a clipping context, and every one of these
          controls draws *outside* its own border box. `btn-chunky` is five
          pixels of hard lip plus a twenty-pixel drop shadow, presses by
          translating down another five, and the shelf carries a badge that
          sits proud of its top-right corner. All of it was being shaved off at
          the container's edge, which is exactly what "cropped" looks like.

          So the actions live outside the scroller with a little padding of
          their own, and can spill as far as they were drawn to.
        */}
        <div className="pointer-events-auto mx-auto flex min-h-0 w-full max-w-md flex-col gap-3">
        <div
          ref={stack}
          className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-1 py-1"
        >
          {outcome !== "open" && <Verdict outcome={outcome} view={view} />}

          {drop && (
            <DropCrate
              drop={drop}
              onDismiss={drops.dismiss}
              onClaim={() => {
                void drops.claim().then((got) => {
                  if (got?.kind === "free_lives") {
                    setMessage(`+${got.amount} free ${got.amount === 1 ? "life" : "lives"}`);
                  } else if (got?.kind === "free_second_wind") {
                    setMessage(`Free run — guesses cost nothing for ${secondWindLabel()}`);
                  } else if (got) {
                    setMessage(`${got.amount}% off — it's on the shelf`);
                  }
                  void refresh();
                  void reload();
                });
              }}
              className="mx-auto w-fit"
            />
          )}

          {result && !won && (
            <ResultCard
              attempt={result.attempt}
              previousBest={result.was}
              previousScore={result.before}
              onClose={() => setResult(null)}
            />
          )}
        </div>

        <div className="shrink-0 px-1 pb-1">
          {verified ? (
            /* The action on top at full width, its two subtabs underneath.
               They used to share a row, which made the one thing you press
               forty times an hour compete for width with two you press
               occasionally. */
            <div className="space-y-2.5">
              <button
                type="button"
                disabled={busy || won}
                onClick={() => setSheet("guess")}
                style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
                className="btn-chunky flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-brass px-3 py-4 text-base text-ink sm:text-lg"
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
          difficulty={view.box.difficulty}
          title={view.box.title}
          blurb={view.box.blurb}
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
          lifeBankKobo={view.lifeBankKobo}
          onClose={() => setSheet("none")}
        />
      )}

      {sheet === "known" && (
        <KnownDialog revealed={revealed} now={now} onClose={() => setSheet("none")} />
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
          <PowerUpShelf
            view={view}
            slug={slug}
            disabled={won}
            now={now}
            /* Inline checkout means nothing unmounts, so the revealed state
               the purchase just bought has to be fetched rather than arriving
               with a fresh render of the page. */
            onBought={(note) => {
              if (note) setMessage(note);
              setSheet("none");
              void reload();
            }}
          />
        </Modal>
      )}

      {rival && <RivalDialog rival={rival} onClose={() => setRival(null)} />}

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
          previousScore={result.before}
          won
          onClose={() => setResult(null)}
        />
      )}
    </>
  );
}

/**
 * Who that car is.
 *
 * A masked address and a percentage, and nothing else — that is the whole of
 * what one stranger should learn about another on a screen where the only
 * shared fact is a password neither of them has.
 */
function RivalDialog({ rival, onClose }: { rival: Rival; onClose: () => void }) {
  return (
    <Modal
      title={rival.you ? "That's you" : "Another hunter"}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          Back to the chase
        </button>
      }
    >
      <div className="space-y-2 pb-1 text-center">
        <p className="break-all font-mono text-sm text-zinc-300">{rival.player}</p>
        <p className="brass-text text-5xl font-black leading-none tracking-tight tabular-nums">
          {rival.percent.toFixed(1)}%
        </p>
      </div>
    </Modal>
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
              {formatNaira(view.box.rewardKobo)} is yours, and it’s sent within
              24 hours. We’ve emailed you —{" "}
              <Link href="/me" className="text-brass underline">
                add your bank account
              </Link>{" "}
              and the transfer follows.
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
