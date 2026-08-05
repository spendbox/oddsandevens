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
import { Check, Repeat2, Tag, Wallet } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { PowerUpArt } from "@/components/art/power-up-art";
import { PowerUpDemo } from "./power-up-demo";
import { formatNaira } from "@/lib/game/rewards";
import { countdown } from "@/components/player/lives-badge";
import { discountedKobo, type Offering } from "@/lib/game/power-ups";
import type { ClaimedDiscount, PlayView } from "@/lib/types";

/**
 * What this one costs today, and what it costs normally.
 *
 * A claimed drop applies to exactly one power-up, so this returns the full
 * price untouched for every other card on the shelf — which is the point of
 * tying a discount to a named power-up in the first place.
 */
function priced(
  powerUp: Offering,
  discount: ClaimedDiscount | null,
  now: number
): {
  payKobo: number;
  /** The undiscounted price, or null when there's nothing to strike through. */
  wasKobo: number | null;
  percentOff: number;
  /** When the discount lapses, so the dialog can count it down. */
  expiresAt: string | null;
} {
  const live =
    discount &&
    discount.powerUp === powerUp.kind &&
    new Date(discount.expiresAt).getTime() > now;

  if (!live) {
    return { payKobo: powerUp.priceKobo, wasKobo: null, percentOff: 0, expiresAt: null };
  }
  return {
    payKobo: discountedKobo(powerUp.priceKobo, discount.amount),
    wasKobo: powerUp.priceKobo,
    percentOff: discount.amount,
    expiresAt: discount.expiresAt,
  };
}

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
        <p className="text-xs text-zinc-500">Tap one to read what it does.</p>
        {view.box.contributor && (
          <p className="shrink-0 text-xs text-zinc-500">
            70% to {view.box.contributor}
          </p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {view.powerUps.map((powerUp, i) => {
          const running = !!powerUp.activeUntil && new Date(powerUp.activeUntil).getTime() > now;
          const price = priced(powerUp, view.discount, now);
          return (
            <button
              key={powerUp.kind}
              type="button"
              onClick={() => setOpen(powerUp)}
              style={{ "--i": i } as React.CSSProperties}
              /*
                A spent power-up is *out*, and it should look it. Sixty percent
                opacity was not enough — the art still had its colour, the price
                was still gold, and it read as available-but-dim. It is
                desaturated, dropped to a third, and captioned "bought" now.
                Still tappable, because what it told you is still worth
                re-reading.
              */
              className={
                "panel animate-fade-up stagger flex items-start gap-3 rounded-xl p-3 text-left transition hover:-translate-y-0.5 hover:border-brass/40 " +
                (powerUp.available || running ? "" : "opacity-55 grayscale")
              }
            >
              <PowerUpArt kind={powerUp.kind} className="size-12 shrink-0 drop-shadow-lg" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span
                      className={
                        "truncate font-semibold " +
                        (powerUp.available || running ? "text-zinc-100" : "text-zinc-400")
                      }
                    >
                      {powerUp.name}
                    </span>
                    {!powerUp.available && !running ? (
                      <span className="flex shrink-0 items-center gap-0.5 rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                        <Check className="size-2.5" aria-hidden />
                        Bought
                      </span>
                    ) : (
                      powerUp.repeat === "once" && (
                        <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                          Once
                        </span>
                      )
                    )}
                  </span>
                  {/* No price on something that can't be bought. A struck-out
                      figure on a spent power-up is an invitation to try. */}
                  {(powerUp.available || running) && (
                    <span className="shrink-0 text-right font-mono text-sm text-brass">
                      {price.wasKobo !== null && (
                        <span className="mr-1.5 text-xs text-zinc-500 line-through">
                          {formatNaira(price.wasKobo)}
                        </span>
                      )}
                      {formatNaira(price.payKobo)}
                    </span>
                  )}
                </span>

                {/* Not uppercased: `countdown` returns "6m", and "6M" on a
                    price tag reads as six million. */}
                {price.expiresAt && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-grape/20 px-1.5 py-0.5 text-[10px] font-black tracking-wide text-grape">
                    <Tag className="size-2.5" aria-hidden />
                    {price.percentOff}% off · {countdown(price.expiresAt, now)}
                  </span>
                )}
                <span className="mt-0.5 block text-xs leading-snug text-zinc-400">
                  {running && powerUp.activeUntil ? (
                    <span className="text-mark-green">
                      Running — {countdown(powerUp.activeUntil, now)} left
                    </span>
                  ) : powerUp.available ? (
                    powerUp.blurb
                  ) : powerUp.repeat === "once" ? (
                    "Bought. It only sells once."
                  ) : powerUp.repeat === "partial" ? (
                    "Nothing left to name — you have all of them."
                  ) : (
                    "Already bought — it has nothing left to tell you."
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* "What you've bought" used to be listed again down here, under the
          shelf. It is the whole content of the Active boosters sheet, laid out
          far better, and repeating it turned the shop into a receipt. */}

      {open && (
        <PowerUpDialog
          powerUp={open}
          price={priced(open, view.discount, now)}
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
 * It says what the power-up does, what it deliberately does *not* do, whether
 * it can be bought again, and what it costs on this box — and never how that
 * price was arrived at.
 */
function PowerUpDialog({
  powerUp,
  price,
  slug,
  contributor,
  disabled,
  now,
  onClose,
}: {
  powerUp: Offering;
  price: ReturnType<typeof priced>;
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

  return (
    <Modal
      title={powerUp.name}
      subtitle={
        running && powerUp.activeUntil
          ? `Running — ${countdown(powerUp.activeUntil, now)} left`
          : `${formatNaira(price.payKobo)} on this box`
      }
      icon={<PowerUpArt kind={powerUp.kind} className="size-7" />}
      width="sm"
      onClose={onClose}
      footer={
        buyable ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void buy()}
            style={{ "--btn-lip": "var(--grape-deep)" } as React.CSSProperties}
            className="btn-chunky flex w-full items-center justify-center gap-2 rounded-2xl bg-grape px-4 py-3.5 text-ink"
          >
            <Wallet className="size-4" aria-hidden />
            {busy ? "Opening checkout…" : `Pay ${formatNaira(price.payKobo)}`}
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl border-2 border-white/12 bg-white/8 px-4 py-3.5 font-bold text-zinc-300"
          >
            Back to the hunt
          </button>
        )
      }
    >
      <div className="space-y-4 pb-1">
        {/* The effect, happening, before a word of it is described. Four
            seconds on a loop, on a password that isn't the one behind this
            box. */}
        <PowerUpDemo kind={powerUp.kind} />

        <p className="text-sm leading-relaxed text-zinc-300">{powerUp.detail}</p>

        <div className="rounded-xl bg-black/25 px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            What it doesn’t do
          </p>
          <p className="mt-1 text-sm text-zinc-400">{powerUp.caveat}</p>
        </div>

        <p className="flex items-start gap-2 text-sm text-zinc-500">
          <Repeat2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          {powerUp.repeat === "once"
            ? "One purchase per box. What it tells you never changes, so there'd be nothing to buy a second time."
            : powerUp.repeat === "partial"
              ? "Buy it as often as you like. Each one draws from what it hasn't shown you yet, so it never repeats itself — and it stops selling once there's nothing left to name."
              : powerUp.repeat === "hourly"
                ? "Runs for an hour, then lapses. Buy it again whenever you need another."
                : "Runs for 24 hours, then lapses. Buy it again whenever you need another."}
        </p>

        {/*
          The price, and not how it was arrived at. It *is* a share of the
          reward, but printing the share turns the shelf into a way of measuring
          the box — and a player who can read a percentage off five prices can
          check they agree, which is a puzzle nobody asked for.
        */}
        <div className="flex items-baseline justify-between gap-3 border-t border-white/10 pt-3">
          <span className="text-sm text-zinc-500">Price on this box</span>
          <span className="shrink-0 font-mono text-lg font-black text-brass">
            {price.wasKobo !== null && (
              <span className="mr-2 text-sm font-bold text-zinc-500 line-through">
                {formatNaira(price.wasKobo)}
              </span>
            )}
            {formatNaira(price.payKobo)}
          </span>
        </div>

        {price.expiresAt && (
          <p className="flex items-center gap-1.5 rounded-xl bg-grape/15 px-3 py-2 text-sm font-bold text-grape">
            <Tag className="size-4 shrink-0" aria-hidden />
            Your {price.percentOff}% off is applied — {countdown(price.expiresAt, now)} to use
            it.
          </p>
        )}

        {contributor && (
          <p className="text-xs text-zinc-500">70% of this goes to {contributor}.</p>
        )}

        {!powerUp.available && !running && (
          <p className="text-sm text-zinc-500">
            You’ve already bought this one. It has nothing left to tell you.
          </p>
        )}

        {error && (
          <p className="rounded-xl bg-berry/15 px-3 py-2 text-sm font-bold text-berry">{error}</p>
        )}
      </div>
    </Modal>
  );
}
