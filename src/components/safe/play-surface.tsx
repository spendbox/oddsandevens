"use client";

// One box, hunted.
//
// The server is the only thing that knows the password — it never leaves
// Postgres — so this component decides nothing about a guess. It collects
// characters, spends a life, and re-renders whatever comes back. Every
// mutation returns a whole fresh view for exactly that reason: there is no
// local model of the game to drift out of step.
//
// The screen is a safe, the field under it, and then two tabs. Attempts and
// power-ups were stacked before and the shelf was three screens down, which is
// a strange place to put the only thing that costs money and the only thing
// that helps. They're peers now: the log is where you work, the shelf is where
// you get unstuck, and you flip between them.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Info,
  MoveDown,
  MoveUp,
  Palette,
  Sparkles,
  Swords,
  Target,
  Users,
} from "lucide-react";
import { ScorePill } from "./score-pill";
import { LIVES_MAX } from "@/lib/constants";
import { plural } from "@/lib/plural";
import { EMPTY_REVEALED } from "@/lib/game/power-ups";
import { formatNaira, rewardLabel } from "@/lib/game/rewards";
import type { AttemptResult, PlayView } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { usePlayer } from "@/components/player/player-context";
import { VerifyDialog } from "@/components/player/account-dialog";
import { BuyLivesDialog } from "@/components/player/buy-lives-dialog";
import { countdown, useNow } from "@/components/player/lives-badge";
import { DifficultyBadge } from "@/components/difficulty-badge";
import { AttemptLog } from "./attempt-log";
import { KnownPanel } from "./known-panel";
import { PasswordField } from "./password-field";
import { PowerUpShelf } from "./power-up-shelf";
import { SafeArt } from "./safe-art";
import { Boxy } from "@/components/art/boxy";

type Outcome = "open" | "won" | "pipped";
type Tab = "attempts" | "power-ups";

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
  const [dialog, setDialog] = useState<"none" | "verify" | "lives" | "rules">("none");
  const [tab, setTab] = useState<Tab>("attempts");
  const [message, setMessage] = useState<string | null>(null);
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
        <BoxHeader
          view={view}
          mood={won || !open ? "open" : busy ? "working" : "idle"}
          onRules={() => setDialog("rules")}
        />

        {!open ? (
          <Cracked view={view} />
        ) : (
          <>
            {outcome !== "open" && <Verdict outcome={outcome} view={view} />}

            {message && (
              <p className="animate-fade-up rounded-2xl border-2 border-brass/50 bg-brass/15 px-3 py-2.5 text-center text-sm font-bold text-brass">
                {message}
              </p>
            )}

            {freeRun && view.hunt?.secondWindUntil && (
              <p className="flex flex-wrap items-center justify-center gap-x-2 rounded-2xl border-2 border-mint/50 bg-mint/15 px-3 py-2.5 text-center text-xs font-bold text-mint">
                <Sparkles className="size-3.5" aria-hidden />
                Second Wind — guesses cost no lives for another{" "}
                <span className="font-mono">
                  {countdown(view.hunt.secondWindUntil, now)}
                </span>
              </p>
            )}

            {view.hunt?.hasBreakdown && view.hunt.breakdownUntil && (
              <p className="flex flex-wrap items-center justify-center gap-x-2 rounded-2xl border-2 border-brass/50 bg-brass/15 px-3 py-2.5 text-center text-xs font-bold text-brass">
                <Palette className="size-3.5" aria-hidden />
                Colour Read is on — every score is split into its parts for another{" "}
                <span className="font-mono">
                  {countdown(view.hunt.breakdownUntil, now)}
                </span>
              </p>
            )}

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
                  onClick={() => setDialog("lives")}
                  className="underline hover:text-zinc-200"
                >
                  or buy some
                </button>
                {" · "}
                <button
                  type="button"
                  onClick={() => setTab("power-ups")}
                  className="underline hover:text-zinc-200"
                >
                  or take an hour with no limit
                </button>
              </p>
            )}

            <div className="space-y-3">
              <div
                role="tablist"
                aria-label="Attempts and power-ups"
                className="panel flex gap-1 rounded-2xl p-1.5"
              >
                <TabButton
                  id="attempts"
                  active={tab}
                  onPick={setTab}
                  icon={<Swords className="size-4" aria-hidden />}
                  label="Your attempts"
                  badge={
                    view.hunt && view.hunt.attemptsCount > 0
                      ? String(view.hunt.attemptsCount)
                      : null
                  }
                />
                <TabButton
                  id="power-ups"
                  active={tab}
                  onPick={setTab}
                  icon={<Sparkles className="size-4" aria-hidden />}
                  label="Power-ups"
                  badge={String(view.powerUps.filter((p) => p.available).length)}
                />
              </div>

              {tab === "attempts" ? (
                <section className="space-y-2">
                  {view.hunt && view.hunt.attemptsCount > 0 && (
                    <div className="flex items-center justify-end gap-2 text-xs text-zinc-500">
                      <span>best so far</span>
                      <ScorePill percent={view.hunt.bestPercent} />
                    </div>
                  )}
                  <AttemptLog attempts={view.hunt?.attempts ?? []} />
                  {view.hunt &&
                    view.hunt.attemptsCount > (view.hunt.attempts.length ?? 0) && (
                      <p className="text-center text-xs text-zinc-600">
                        Showing your last {view.hunt.attempts.length} of{" "}
                        {view.hunt.attemptsCount}.
                      </p>
                    )}
                </section>
              ) : (
                <PowerUpShelf view={view} slug={slug} disabled={won} now={now} />
              )}
            </div>
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
      {dialog === "lives" && (
        <BuyLivesDialog
          slug={slug}
          contributor={view.box.contributor}
          onClose={() => setDialog("none")}
        />
      )}
      {dialog === "rules" && <RulesDialog onClose={() => setDialog("none")} />}
    </>
  );
}

function TabButton({
  id,
  active,
  onPick,
  icon,
  label,
  badge,
}: {
  id: Tab;
  active: Tab;
  onPick: (tab: Tab) => void;
  icon: React.ReactNode;
  label: string;
  badge: string | null;
}) {
  const on = active === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={() => onPick(id)}
      className={
        "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition " +
        (on
          ? "bg-brass text-ink shadow-[inset_0_1.5px_0_rgba(255,255,255,0.45),0_3px_0_var(--brass-deep)]"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100")
      }
    >
      {icon}
      {label}
      {badge && (
        <span
          className={
            "rounded-md px-1.5 py-0.5 font-mono text-[10px] font-black " +
            (on ? "bg-ink/20 text-ink" : "bg-white/8 text-zinc-400")
          }
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function BoxHeader({
  view,
  mood,
  onRules,
}: {
  view: PlayView;
  mood: "idle" | "working" | "open";
  onRules: () => void;
}) {
  const { box } = view;
  return (
    <header className="space-y-2 text-center">
      {/* Boxy is doing the reacting so the safe doesn't have to. A dial that
          spins is a nice touch; a face that looks worried while you wait is
          the thing people actually notice. */}
      <div className="flex items-end justify-center gap-1">
        <SafeArt design={box.design} mood={mood} className="size-28 sm:size-36" />
        <Boxy
          mood={mood === "open" ? "cheer" : mood === "working" ? "thinking" : "sly"}
          className="size-24 sm:size-28"
        />
      </div>

      <p className="text-xs uppercase tracking-widest text-zinc-500">
        {box.kind === "general" ? "Created by Spendbox" : `Created by ${box.contributor}`}
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
        <button
          type="button"
          onClick={onRules}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300 transition hover:border-brass/40 hover:text-brass"
        >
          <Info className="size-3.5" aria-hidden />
          How this works
        </button>
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

/**
 * The rules, in a dialog rather than down the page.
 *
 * They were an accordion sitting between the field and the log, which meant
 * everybody scrolled past them forever and nobody read them once. A player
 * needs this twice — the first minute, and the moment a score stops making
 * sense — and both times they go looking for it. So it lives behind a button
 * that is always in the same place.
 *
 * What it never explains is *how* a score is arrived at. The weights aren't
 * printed here or anywhere else a player can reach.
 */
function RulesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="How this works"
      subtitle="Guess blind. One life, one guess."
      icon={<Info className="size-5 text-brass" aria-hidden />}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          Got it
        </button>
      }
    >
      <div className="space-y-4 pb-1">
        <p className="text-sm leading-relaxed text-zinc-700">
          There&apos;s a password behind this safe. You don&apos;t know how long
          it is, what it&apos;s made of, or where anything sits.{" "}
          <strong className="text-zinc-900">Anything on a keyboard</strong> can be
          in it — letters in either case, digits, and symbols like{" "}
          <span className="font-mono">&amp; $ # ) ( ; : ! ? *</span>. Type a guess,
          spend a life, and read what comes back.
        </p>

        <Rule
          icon={<MoveUp className="size-4 text-sky-600" aria-hidden />}
          title="Up arrow — add characters"
          body="Your guess was shorter than the password."
        />
        <Rule
          icon={<MoveDown className="size-4 text-sky-600" aria-hidden />}
          title="Down arrow — remove characters"
          body="Your guess was longer than the password."
        />
        <Rule
          icon={<Target className="size-4 text-mark-green" aria-hidden />}
          title="Target — right length"
          body="Exactly as many characters as the password. Nothing tells you the number until you find it."
        />
        <Rule
          icon={<span className="text-sm font-bold text-zinc-900">%</span>}
          title="A score out of 100"
          body="How close the guess is. Every position contributes something — an exact character most, the right letter in the wrong case least, a character that's in the password but somewhere else in between — and the total is measured against a perfect guess. 100% is the password itself, and nothing else reaches it."
        />

        <div className="space-y-2 border-t border-zinc-100 pt-3 text-sm text-zinc-500">
          <p>
            <strong className="text-zinc-700">The arithmetic isn&apos;t
            published.</strong>{" "}
            Two very different guesses can score the same, and working out which
            explanation fits is the game.
          </p>
          <p>
            <strong className="text-zinc-700">Case counts.</strong>{" "}
            <span className="font-mono">k</span> and{" "}
            <span className="font-mono">K</span> are different characters.
          </p>
          <p>
            <strong className="text-zinc-700">Lives come back on their own</strong>{" "}
            — one an hour, up to {LIVES_MAX}. You never have to buy any.
          </p>
          <p>
            <strong className="text-zinc-700">Power-ups are the only paid
            part</strong>, and each one buys back exactly one of the things
            withheld above. On someone&apos;s box, 70% of what you spend goes to
            them.
          </p>
          <p>Tap any attempt in the log to read it in full.</p>
        </div>
      </div>
    </Modal>
  );
}

function Rule({
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
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="mt-0.5 text-sm leading-snug text-zinc-500">{body}</p>
      </div>
    </div>
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

export { LIVES_MAX };
