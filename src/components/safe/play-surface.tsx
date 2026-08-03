"use client";

// One box, played.
//
// The server is the only thing that knows the password, so this component
// never decides anything about a guess — it collects characters, posts them,
// and re-renders whatever comes back. Every mutation returns a whole fresh
// view for exactly that reason: there is no local model of the game to drift.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock, LockOpen, Trophy, Users } from "lucide-react";
import { ALPHABET_SET, LIVES_MAX } from "@/lib/constants";
import { keyboardState, type Mark } from "@/lib/game/feedback";
import { formatNaira } from "@/lib/game/stakes";
import type { PlayView } from "@/lib/types";
import { usePlayer } from "@/components/player/player-context";
import { VerifyDialog } from "@/components/player/verify-dialog";
import { BuyLivesDialog } from "@/components/player/buy-lives-dialog";
import { countdown } from "@/components/player/lives-badge";
import { BoardLegend, GuessBoard } from "./guess-board";
import { Keypad } from "./keypad";
import { PowerUpShelf } from "./power-up-shelf";

type Outcome = "open" | "won" | "lost" | "pipped";

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
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("open");
  const [dialog, setDialog] = useState<"none" | "verify" | "lives">("none");
  const [message, setMessage] = useState<string | null>(null);

  const run = view.run;
  const active = run?.status === "active";
  const length = view.box.length;

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
    (async () => {
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
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingReference, reload, slug]);

  // Physical keyboards: this is a typing game, so someone at a desk should be
  // able to type. The keypad and the keyboard drive the same state.
  const typedRef = useRef(typed);
  typedRef.current = typed;
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        setTyped((t) => t.slice(0, -1));
        return;
      }
      const char = event.key.toUpperCase();
      if (char.length === 1 && ALPHABET_SET.has(char)) {
        event.preventDefault();
        setTyped((t) => (t.length < length ? t + char : t));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `submit` is stable enough for this: it reads the live guess off a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, length]);

  async function startRun() {
    if (!verified) {
      setDialog("verify");
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/boxes/${slug}/run`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as PlayView & {
      error?: string;
      nextLifeAt?: string;
    };
    setBusy(false);

    if (res.ok) {
      setView(body);
      setTyped("");
      setOutcome("open");
      await refresh();
      return;
    }
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
    setMessage("This box isn't taking attempts right now.");
  }

  async function submit() {
    const guess = typedRef.current;
    if (busy || guess.length !== length) {
      setShake((s) => s + 1);
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/boxes/${slug}/guess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guess }),
    });
    const body = (await res.json().catch(() => ({}))) as PlayView & {
      outcome?: Outcome;
      error?: string;
    };
    setBusy(false);

    if (!res.ok) {
      setShake((s) => s + 1);
      setMessage(
        body.error === "out_of_guesses"
          ? "That attempt is over."
          : body.error === "no_run"
            ? "Start an attempt first."
            : "That guess didn't go through."
      );
      return;
    }

    setView(body);
    setTyped("");
    setOutcome(body.outcome ?? "open");
    await refresh();
  }

  const marks: Record<string, Mark> = run ? keyboardState(run.guesses) : {};
  const dead = new Set(run?.revealed.dead ?? []);
  const left = run ? run.guessesAllowed - run.guessesUsed : 0;

  return (
    <>
      <div className="mx-auto w-full max-w-xl space-y-5 px-4 py-6">
        <BoxHeader view={view} />

        {view.box.status === "unlocked" ? (
          <Cracked view={view} />
        ) : (
          <>
            <div className="panel rounded-2xl p-4 sm:p-5">
              <div className="mb-3 space-y-2">
                <BoardLegend />
                {run && (
                  <p className="text-center text-xs text-zinc-500">
                    {active
                      ? `${left} ${left === 1 ? "guess" : "guesses"} left`
                      : run.status === "won"
                        ? "You opened it."
                        : "That attempt is spent."}
                  </p>
                )}
              </div>

              <GuessBoard
                length={length}
                rows={run?.guesses ?? []}
                current={active ? typed : null}
                revealed={
                  run?.revealed ?? {
                    positions: {},
                    dead: [],
                    charset: null,
                    bonusGuesses: 0,
                    used: {},
                  }
                }
                totalRows={run?.guessesAllowed ?? view.box.guessesAllowed}
                shake={shake}
              />

              {run?.revealed.charset && (
                <p className="mt-3 text-center text-xs text-zinc-400">
                  Built from{" "}
                  <span className="font-mono text-brass">
                    {run.revealed.charset.join(" ")}
                  </span>
                </p>
              )}
            </div>

            {message && (
              <p className="rounded-xl border border-brass/30 bg-brass/10 px-3 py-2 text-center text-sm text-brass">
                {message}
              </p>
            )}

            {outcome !== "open" && <Verdict outcome={outcome} view={view} />}

            {active ? (
              <Keypad
                marks={marks}
                dead={dead}
                disabled={busy}
                canSubmit={typed.length === length}
                onKey={(char) => setTyped((t) => (t.length < length ? t + char : t))}
                onEnter={() => void submit()}
                onBackspace={() => setTyped((t) => t.slice(0, -1))}
              />
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void startRun()}
                className="w-full rounded-xl bg-brass px-4 py-3.5 font-bold text-zinc-950 transition hover:bg-brass-bright disabled:opacity-50"
              >
                {busy
                  ? "Opening…"
                  : run
                    ? "Try again — costs 1 life"
                    : "Start an attempt — costs 1 life"}
              </button>
            )}

            <p className="text-center text-xs text-zinc-500">
              A life comes back every hour, up to {LIVES_MAX}. Crack it and you keep
              the life.
            </p>

            <PowerUpShelf view={view} slug={slug} disabled={!active} />
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
        {box.kind === "general" ? "The public box" : `Staked by ${box.contributor}`}
      </p>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{box.title}</h1>
      {box.blurb && <p className="text-sm text-zinc-400">{box.blurb}</p>}

      <p className="brass-text text-4xl font-black tabular-nums sm:text-5xl">
        {formatNaira(box.prizeKobo)}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <Lock className="size-3.5" aria-hidden />
          {box.length} characters
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden />
          {box.playersCount} {box.playersCount === 1 ? "player" : "players"},{" "}
          {box.attemptsCount} {box.attemptsCount === 1 ? "attempt" : "attempts"}
        </span>
      </div>
    </header>
  );
}

/** The end of a run, said plainly. */
function Verdict({ outcome, view }: { outcome: Outcome; view: PlayView }) {
  if (outcome === "won") {
    return (
      <div className="panel animate-unlock rounded-2xl border-brass/40 p-5 text-center">
        <Trophy className="mx-auto size-10 text-brass" aria-hidden />
        <p className="mt-2 text-lg font-bold">The safe is open.</p>
        <p className="mt-1 text-sm text-zinc-400">
          {formatNaira(view.box.prizeKobo)} is yours. We&apos;ve emailed you —{" "}
          <Link href="/me" className="text-brass underline">
            add your bank account
          </Link>{" "}
          and we&apos;ll send it.
        </p>
      </div>
    );
  }

  if (outcome === "pipped") {
    return (
      <div className="panel rounded-2xl p-4 text-center text-sm text-zinc-300">
        You got the password — but somebody else submitted it first, seconds
        ago. The box is closed. Your life has been returned.
      </div>
    );
  }

  return (
    <div className="panel rounded-2xl p-4 text-center text-sm text-zinc-300">
      Out of guesses. The password is still in there — go again when you&apos;re
      ready.
    </div>
  );
}

function Cracked({ view }: { view: PlayView }) {
  return (
    <div className="panel rounded-2xl p-6 text-center">
      <LockOpen className="mx-auto size-10 text-brass" aria-hidden />
      <p className="mt-3 text-lg font-bold">This one&apos;s been opened.</p>
      <p className="mt-1 text-sm text-zinc-400">
        {view.box.unlockedBy ?? "A player"} guessed the password and took{" "}
        {formatNaira(view.box.prizeKobo)}. An unlocked box can&apos;t be played
        again.
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
