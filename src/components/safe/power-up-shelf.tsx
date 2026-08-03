"use client";

// The shop, sat under the board.
//
// They matter far more than they used to: a box hides its length, gives no
// "somewhere in there" signal, and cares about case. Everything here is
// optional and everything here is paid, so it says what it
// costs before it says what it does, and where the money goes is written on
// the shelf rather than buried in terms — on a contributor's box, most of what
// you spend goes to the person who put the prize up.

import { useState } from "react";
import { Eraser, Eye, Flashlight, Layers, Palette, Ruler, Scan, Sparkles } from "lucide-react";
import { formatNaira } from "@/lib/game/rewards";
import type { PowerUpKind } from "@/lib/game/power-ups";
import type { PlayView } from "@/lib/types";

const ICONS: Record<PowerUpKind, typeof Eraser> = {
  breakdown: Palette,
  length_lock: Ruler,
  sweep: Eraser,
  case_map: Layers,
  first_light: Sparkles,
  last_light: Flashlight,
  spotlight: Scan,
  x_ray: Eye,
};

export function PowerUpShelf({
  view,
  slug,
  disabled,
}: {
  view: PlayView;
  slug: string;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState<PowerUpKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(kind: PowerUpKind) {
    setBusy(kind);
    setError(null);
    const res = await fetch(`/api/boxes/${slug}/power-up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      authorizationUrl?: string;
      error?: string;
    };
    if (res.ok && body.authorizationUrl) {
      window.location.assign(body.authorizationUrl);
      return;
    }
    setBusy(null);
    setError(
      body.error === "payments_unavailable"
        ? "Payments aren't switched on yet."
        : body.error === "already_won"
          ? "You've already opened this one."
          : "Couldn't open checkout. Try again in a moment."
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Power-ups
        </h2>
        {view.box.contributor && (
          <p className="text-xs text-zinc-500">70% goes to {view.box.contributor}</p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {view.powerUps.map((powerUp) => {
          const Icon = ICONS[powerUp.kind];
          const off = disabled || !powerUp.available || busy !== null;
          return (
            <button
              key={powerUp.kind}
              type="button"
              disabled={off}
              onClick={() => void buy(powerUp.kind)}
              className="panel flex items-start gap-3 rounded-xl p-3 text-left transition enabled:hover:border-brass/40 disabled:opacity-40"
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brass/10">
                <Icon className="size-4 text-brass" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-zinc-100">{powerUp.name}</span>
                  <span className="shrink-0 font-mono text-sm text-brass">
                    {formatNaira(powerUp.priceKobo)}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-zinc-400">
                  {busy === powerUp.kind
                    ? "Opening checkout…"
                    : powerUp.available
                      ? powerUp.blurb
                      : powerUp.kind === "breakdown"
                        ? "Running — buy it again once it lapses."
                        : "Already bought, or nothing left for it to tell you."}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {view.hunt && view.hunt.notes.length > 0 && (
        <div className="panel rounded-xl p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            What you&apos;ve bought
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-brass">
            {view.hunt.notes.map((note: string, i: number) => (
              <li key={i} className="font-mono">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
