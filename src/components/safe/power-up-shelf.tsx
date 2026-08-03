"use client";

// The shop.
//
// Power-ups matter far more than they used to: a box hides its length, gives
// no positional hints, and cares about case. Everything here is optional and
// everything here is paid.
//
// Two rules the layout follows. **Nothing buys on a tap** — a tap opens the
// full explanation, and payment is a second, deliberate action inside it,
// because these cost a share of the reward and on a large box that is real
// money. And **where the money goes is on the shelf**, not buried in terms: on
// a contributor's box, most of what you spend goes to the person who put the
// prize up.

import { useState } from "react";
import {
  Clock,
  Eye,
  Layers,
  Palette,
  Ruler,
  Wallet,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatNaira } from "@/lib/game/rewards";
import { countdown } from "@/components/player/lives-badge";
import type { Offering, PowerUpKind } from "@/lib/game/power-ups";
import type { PlayView } from "@/lib/types";

const ICONS: Record<PowerUpKind, typeof Eye> = {
  length_lock: Ruler,
  case_map: Layers,
  second_wind: Clock,
  breakdown: Palette,
  x_ray: Eye,
};

export function PowerUpShelf({
  view,
  slug,
  disabled,
  now,
}: {
  view: PlayView;
  slug: string;
  disabled: boolean;
  /** Ticking clock from the parent — rendering must not call one itself. */
  now: number;
}) {
  const [open, setOpen] = useState<Offering | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs text-zinc-500">
          Priced against this box&apos;s reward. Tap one to read what it does.
        </p>
        {view.box.contributor && (
          <p className="shrink-0 text-xs text-zinc-500">
            70% to {view.box.contributor}
          </p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {view.powerUps.map((powerUp, i) => {
          const Icon = ICONS[powerUp.kind];
          const running = !!powerUp.activeUntil && new Date(powerUp.activeUntil).getTime() > now;
          return (
            <button
              key={powerUp.kind}
              type="button"
              onClick={() => setOpen(powerUp)}
              style={{ "--i": i } as React.CSSProperties}
              className={
                "panel animate-fade-up stagger flex items-start gap-3 rounded-xl p-3 text-left transition hover:-translate-y-0.5 hover:border-brass/40 " +
                (powerUp.available ? "" : "opacity-60")
              }
            >
              <span
                className={
                  "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg " +
                  (running ? "bg-mark-green/15" : "bg-brass/10")
                }
              >
                <Icon
                  className={"size-4 " + (running ? "text-mark-green" : "text-brass")}
                  aria-hidden
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-zinc-100">{powerUp.name}</span>
                  <span className="shrink-0 font-mono text-sm text-brass">
                    {formatNaira(powerUp.priceKobo)}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-zinc-400">
                  {running && powerUp.activeUntil ? (
                    <span className="text-mark-green">
                      Running — {countdown(powerUp.activeUntil, now)} left
                    </span>
                  ) : powerUp.available ? (
                    powerUp.blurb
                  ) : (
                    "Already bought — it has nothing left to tell you."
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

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

      {open && (
        <PowerUpDialog
          powerUp={open}
          slug={slug}
          contributor={view.box.contributor}
          disabled={disabled}
          now={now}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

/**
 * The whole pitch, then the button.
 *
 * It says what the power-up does, what it deliberately does *not* do, and what
 * it costs — including the arithmetic that got to the price, because "1.5% of
 * the reward" is a number a player can check and a flat ₦10,000 was one they
 * had to take on faith.
 */
function PowerUpDialog({
  powerUp,
  slug,
  contributor,
  disabled,
  now,
  onClose,
}: {
  powerUp: Offering;
  slug: string;
  contributor: string | null;
  disabled: boolean;
  now: number;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const running = !!powerUp.activeUntil && new Date(powerUp.activeUntil).getTime() > now;
  const buyable = powerUp.available && !disabled;

  async function buy() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/boxes/${slug}/power-up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: powerUp.kind }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      authorizationUrl?: string;
      error?: string;
    };
    if (res.ok && body.authorizationUrl) {
      window.location.assign(body.authorizationUrl);
      return;
    }
    setBusy(false);
    setError(
      body.error === "payments_unavailable"
        ? "Payments aren't switched on yet."
        : body.error === "already_won"
          ? "You've already opened this one."
          : body.error === "not_verified"
            ? "Verify your email address first — it's how a life pool is kept."
            : "Couldn't open checkout. Try again in a moment."
    );
  }

  const Icon = ICONS[powerUp.kind];

  return (
    <Modal
      title={powerUp.name}
      subtitle={
        running && powerUp.activeUntil
          ? `Running — ${countdown(powerUp.activeUntil, now)} left`
          : `${formatNaira(powerUp.priceKobo)} on this box`
      }
      icon={<Icon className="size-5 text-brass" aria-hidden />}
      width="sm"
      onClose={onClose}
      footer={
        buyable ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void buy()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brass px-4 py-3 font-semibold text-zinc-950 transition hover:bg-brass-bright disabled:opacity-50"
          >
            <Wallet className="size-4" aria-hidden />
            {busy ? "Opening checkout…" : `Pay ${formatNaira(powerUp.priceKobo)}`}
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-zinc-100 px-4 py-3 font-semibold text-zinc-700"
          >
            Back to the hunt
          </button>
        )
      }
    >
      <div className="space-y-4 pb-1">
        <p className="text-sm leading-relaxed text-zinc-700">{powerUp.detail}</p>

        <div className="rounded-xl bg-zinc-100 px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            What it doesn&apos;t do
          </p>
          <p className="mt-1 text-sm text-zinc-600">{powerUp.caveat}</p>
        </div>

        <div className="flex items-baseline justify-between gap-3 border-t border-zinc-100 pt-3">
          <span className="text-sm text-zinc-500">
            {(powerUp.share * 100).toFixed(2).replace(/\.?0+$/, "")}% of the reward
            {powerUp.priceKobo === powerUp.floorKobo && ", or the floor — whichever is more"}
          </span>
          <span className="shrink-0 font-mono text-lg font-bold text-zinc-900">
            {formatNaira(powerUp.priceKobo)}
          </span>
        </div>

        {contributor && (
          <p className="text-xs text-zinc-500">
            70% of this goes to {contributor}, who put the box up. Spendbox keeps
            30%.
          </p>
        )}

        {!powerUp.available && !running && (
          <p className="text-sm text-zinc-500">
            You&apos;ve already bought this one. It has nothing left to tell you.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
