"use client";

// Changing a password from inside a live session.
//
// The session is itself proof of the address — it was minted from a code or a
// password — so an account that has never had one can set one here without
// another email. An account that *does* have one has to say it, because a
// borrowed unlocked phone shouldn't be able to lock its owner out.

import { useState } from "react";
import { Eye, EyeOff, KeyRound, LogOut } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "@/lib/player-password";

const INPUT =
  "field px-4 py-3";

export function SecurityPanel() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    setDone(false);
    const res = await fetch("/api/player/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "change",
        currentPassword: current,
        password: next,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (res.ok) {
      setCurrent("");
      setNext("");
      setDone(true);
      return;
    }
    setError(
      body.error === "wrong_password"
        ? "That isn't your current password."
        : body.error === "weak_password"
          ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
          : "Couldn't change it. Try again in a moment."
    );
  }

  return (
    <section className="panel space-y-4 rounded-3xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-zinc-300">
        <KeyRound className="size-4 text-brass" aria-hidden />
        Your password
      </h2>

      <div className="space-y-3">
        <input
          type={reveal ? "text" : "password"}
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Current password"
          className={INPUT}
        />
        <div className="relative">
          <input
            type={reveal ? "text" : "password"}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder={`New password — at least ${MIN_PASSWORD_LENGTH} characters`}
            className={`${INPUT} pr-12`}
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide passwords" : "Show passwords"}
            className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 active:translate-y-[calc(-50%+1px)]"
          >
            {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>

        {error && <p className="text-sm font-semibold text-berry">{error}</p>}
        {done && <p className="text-sm font-semibold text-mint">Password changed.</p>}

        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-5 py-3.5 text-ink"
        >
          {busy ? "Saving…" : "Change password"}
        </button>

        <p className="text-xs text-zinc-500">
          Forgotten it instead? Sign out and use “I’ve forgotten my
          password” — we’ll email you a code.
        </p>
      </div>

      {/*
        Sign out lives here rather than in the header. It is the one control on
        the site nobody wants to hit by accident, and burying it two taps deep
        costs the person who wants it about a second.
      */}
      <div className="border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/player/signout", { method: "POST" });
            window.location.assign("/");
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-white/12 bg-white/6 px-4 py-3 text-sm font-bold text-zinc-300 transition hover:border-berry/50 hover:text-berry active:translate-y-0.5"
        >
          <LogOut className="size-4" aria-hidden />
          Sign out
        </button>
        <p className="mt-2 text-center text-xs text-zinc-500">
          Your lives, boxes and rewards are all kept. Signing back in picks up
          where you left off.
        </p>
      </div>
    </section>
  );
}
