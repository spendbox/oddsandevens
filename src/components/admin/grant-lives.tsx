"use client";

// Handing a player lives.
//
// The lookup before the grant is the point of this component. Lives given to a
// mistyped address are gone and the person you were apologising to still
// hasn't got them, so the current holding is shown first and the button says
// what it will make the number.

import { useState } from "react";
import { Heart, Search } from "lucide-react";
import { EMAIL_REGEX } from "@/lib/constants";
import { plural } from "@/lib/plural";

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brass";

interface Found {
  email: string;
  lives: number;
  since: string;
}

export function GrantLives() {
  const [email, setEmail] = useState("");
  const [count, setCount] = useState(5);
  const [found, setFound] = useState<Found | null | "missing">(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid = EMAIL_REGEX.test(email.trim());

  async function look() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/lives?email=${encodeURIComponent(email.trim())}`);
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't look that up.");
      return;
    }
    const body = (await res.json()) as { player: Found | null };
    setFound(body.player ?? "missing");
  }

  async function grant() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/lives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), count }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      lives?: number;
      error?: string;
    };
    setBusy(false);
    if (!res.ok) {
      setError(body.error === "invalid_count" ? "1 to 500 lives." : "Couldn't grant that.");
      return;
    }
    setNotice(`${plural(count, "life", "lives")} granted. They now hold ${body.lives}.`);
    setFound(null);
    setEmail("");
  }

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        <Heart className="size-4 text-brass" aria-hidden />
        Give a player lives
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        Free, on top of their refill. Works for an address that has never played —
        the lives wait for them.
      </p>

      <div className="mt-3 space-y-2">
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFound(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && valid && void look()}
            placeholder="player@example.com"
            className={INPUT}
          />
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => void look()}
            aria-label="Look up"
            className="shrink-0 rounded-xl border border-white/10 px-4 text-sm text-zinc-400 transition hover:border-brass/40 disabled:opacity-40"
          >
            <Search className="size-4" aria-hidden />
          </button>
        </div>

        {found === "missing" && (
          <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-400">
            Nobody has played under that address yet. Granting will create them, and
            the lives will be there when they verify.
          </p>
        )}

        {found && found !== "missing" && (
          <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-300">
            {found.email} holds{" "}
            <strong className="text-brass">{plural(found.lives, "life", "lives")}</strong>
            , playing since {new Date(found.since).toLocaleDateString()}.
          </p>
        )}

        <label className="block">
          <span className="text-xs text-zinc-500">How many</span>
          <input
            type="number"
            min={1}
            max={500}
            value={count}
            onChange={(e) =>
              setCount(Math.min(Math.max(Math.trunc(Number(e.target.value) || 1), 1), 500))
            }
            className={`mt-1 ${INPUT} font-mono`}
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {notice && <p className="text-sm text-mark-green">{notice}</p>}

        <button
          type="button"
          disabled={!valid || busy}
          onClick={() => void grant()}
          className="w-full rounded-xl bg-brass px-5 py-3 font-semibold text-zinc-950 transition hover:bg-brass-bright disabled:opacity-50"
        >
          {busy
            ? "Working…"
            : found && found !== "missing"
              ? `Grant ${plural(count, "life", "lives")} — they'd hold ${found.lives + count}`
              : `Grant ${plural(count, "life", "lives")}`}
        </button>
      </div>
    </section>
  );
}
