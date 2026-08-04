"use client";

// Buying lives, framed honestly: the free refill is stated first, and the
// purchase is the alternative rather than the point.
//
// Two things can be bought here, and they answer the same question in opposite
// ways. Lives are quantity — a fixed number of guesses, yours forever, spendable
// anywhere. Second Wind is *time* — one hour on this box with no limit at all
// and no life spent. Somebody who has run dry mid-hunt wants one or the other
// depending entirely on whether they have an hour, and making them find the
// second one on a different screen was hiding the answer to the question they
// just asked.

import { useState } from "react";
import { Heart, Infinity as InfinityIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { LIFE_PURCHASE_MAX } from "@/lib/constants";
import { PowerUpArt } from "@/components/art/power-up-art";
import { SECOND_WIND_HOURS, type Offering } from "@/lib/game/power-ups";
import { formatNaira } from "@/lib/game/rewards";
import { usePlayer } from "./player-context";
import { countdown, useNow } from "./lives-badge";

const QUICK_PICKS = [1, 3, 5, 10];

type Buying = "lives" | "wind";

export function BuyLivesDialog({
  onClose,
  /** The box they were hunting, if they were. Its contributor takes 70%. */
  slug,
  contributor,
  /**
   * Second Wind, priced against this box. Absent when there is no box — from
   * the header there is nothing for an hour of unlimited guesses to apply to.
   */
  secondWind,
}: {
  onClose: () => void;
  slug?: string;
  contributor?: string | null;
  secondWind?: Offering | null;
}) {
  const { player } = usePlayer();
  const now = useNow(player.nextLifeAt);
  const [quantity, setQuantity] = useState(3);
  const [buying, setBuying] = useState<Buying>("lives");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const windRunning =
    !!secondWind?.activeUntil && new Date(secondWind.activeUntil).getTime() > now;
  const canWind = !!secondWind && !!slug && secondWind.available && !windRunning;
  const wind = buying === "wind" && canWind;

  async function checkout() {
    if (wind && secondWind && slug) return buyWind();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/player/lives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity, slug }),
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
        ? "Payments aren't switched on yet. Your lives will still refill on their own."
        : "Couldn't start that payment. Try again in a moment."
    );
  }

  /** Second Wind is a power-up, so it settles through the power-up route. */
  async function buyWind() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/boxes/${slug}/power-up`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "second_wind" }),
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
        ? "Payments aren’t switched on yet."
        : "Couldn’t open checkout. Try again in a moment."
    );
  }

  const total = wind && secondWind ? secondWind.priceKobo : quantity * player.lifePriceKobo;

  return (
    <Modal
      title={canWind ? "Keep going" : "More lives"}
      subtitle={
        canWind
          ? "Buy guesses, or buy an hour of them."
          : `${formatNaira(player.lifePriceKobo)} each.`
      }
      icon={<Heart className="size-5 fill-brass text-brass" aria-hidden />}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy}
          onClick={() => void checkout()}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          {busy
            ? "Opening checkout…"
            : wind
              ? `Take the hour · ${formatNaira(total)}`
              : `Pay ${formatNaira(total)}`}
        </button>
      }
    >
      <div className="space-y-4 pb-1">
        <p className="rounded-xl bg-black/25 px-3 py-2.5 text-sm text-zinc-400">
          You don’t have to buy anything. A life comes back every hour on its
          own
          {player.nextLifeAt
            ? ` — the next one in ${countdown(player.nextLifeAt, now)}.`
            : ", and your pool is full right now."}
        </p>

        {player.bonusLivesPending > 0 && (
          <p className="rounded-xl bg-brass/10 px-3 py-2.5 text-sm text-brass">
            <strong>
              +{player.bonusLivesPending} free{" "}
              {player.bonusLivesPending === 1 ? "life" : "lives"}
            </strong>{" "}
            from your invites land with this one. You’ll get{" "}
            {quantity + player.bonusLivesPending} in total.
          </p>
        )}

        {contributor && (
          <p className="text-sm text-zinc-500">
            Lives you buy anywhere work everywhere.
          </p>
        )}

        {canWind && secondWind && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Option
              on={buying === "lives"}
              onPick={() => setBuying("lives")}
              icon={<Heart className="size-6 fill-berry text-berry" aria-hidden />}
              title="Lives"
              body="A guess each. Yours forever, on any box."
              price={`${formatNaira(player.lifePriceKobo)} each`}
            />
            <Option
              on={buying === "wind"}
              onPick={() => setBuying("wind")}
              icon={<PowerUpArt kind="second_wind" className="size-7" />}
              title="Second Wind"
              body={SECOND_WIND_HOURS === 1 ? "Immortal for one hour." : `Immortal for ${SECOND_WIND_HOURS} hours.`}
              price={formatNaira(secondWind.priceKobo)}
            />
          </div>
        )}

        {windRunning && secondWind?.activeUntil && (
          <p className="flex items-center gap-2 rounded-xl border-2 border-mint/40 bg-mint/15 px-3 py-2.5 text-sm font-bold text-mint">
            <InfinityIcon className="size-4" aria-hidden />
            Second Wind is already running — {countdown(secondWind.activeUntil, now)}{" "}
            left, and every guess is free.
          </p>
        )}

        <div className={"flex flex-wrap gap-2 " + (wind ? "hidden" : "")}>
          {QUICK_PICKS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setQuantity(n)}
              className={
                "rounded-xl border-2 px-4 py-2.5 text-sm font-bold transition " +
                (quantity === n
                  ? "border-brass bg-brass/15 text-foreground"
                  : "border-white/12 bg-white/5 text-zinc-300 hover:border-white/30")
              }
            >
              {n} {n === 1 ? "life" : "lives"}
            </button>
          ))}
        </div>

        <label className={"block " + (wind ? "hidden" : "")}>
          <span className="text-sm text-zinc-500">Or pick a number</span>
          <input
            type="number"
            min={1}
            max={LIFE_PURCHASE_MAX}
            value={quantity}
            onChange={(e) =>
              setQuantity(
                Math.min(Math.max(Math.trunc(Number(e.target.value) || 1), 1), LIFE_PURCHASE_MAX)
              )
            }
            className="field mt-1.5 px-4 py-3"
          />
        </label>

        {error && (
          <p className="rounded-xl bg-berry/15 px-3 py-2 text-sm font-bold text-berry">{error}</p>
        )}
      </div>
    </Modal>
  );
}

/** One of the two things you can buy here. */
function Option({
  on,
  onPick,
  icon,
  title,
  body,
  price,
}: {
  on: boolean;
  onPick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
  price: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={
        "flex flex-col items-start gap-1 rounded-2xl border-2 p-3 text-left transition " +
        (on
          ? "border-brass bg-brass/15"
          : "border-white/12 bg-white/5 hover:border-white/30")
      }
    >
      <span className="flex items-center gap-2 font-black tracking-tight">
        {icon}
        {title}
      </span>
      <span className="text-xs leading-snug text-zinc-400">{body}</span>
      <span className="mt-0.5 font-mono text-sm font-black text-brass">{price}</span>
    </button>
  );
}
