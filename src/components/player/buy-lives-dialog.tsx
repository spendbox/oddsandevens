"use client";

// Buying lives, framed honestly: the free refill is stated first, and the
// purchase is the alternative rather than the point.

import { useState } from "react";
import { Heart } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { LIFE_PURCHASE_MAX } from "@/lib/constants";
import { formatNaira } from "@/lib/game/rewards";
import { usePlayer } from "./player-context";
import { countdown, useNow } from "./lives-badge";

const QUICK_PICKS = [1, 3, 5, 10];

export function BuyLivesDialog({
  onClose,
  /** The box they were hunting, if they were. Its contributor takes 70%. */
  slug,
  contributor,
}: {
  onClose: () => void;
  slug?: string;
  contributor?: string | null;
}) {
  const { player } = usePlayer();
  const now = useNow(player.nextLifeAt);
  const [quantity, setQuantity] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkout() {
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

  const total = quantity * player.lifePriceKobo;

  return (
    <Modal
      title="More lives"
      subtitle={`${formatNaira(player.lifePriceKobo)} each.`}
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
          {busy ? "Opening checkout…" : `Pay ${formatNaira(total)}`}
        </button>
      }
    >
      <div className="space-y-4 pb-1">
        <p className="rounded-xl bg-zinc-100 px-3 py-2.5 text-sm text-zinc-600">
          You don&apos;t have to buy anything. A life comes back every hour on its
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
            from your invites land with this one. You&apos;ll get{" "}
            {quantity + player.bonusLivesPending} in total.
          </p>
        )}

        {contributor && (
          <p className="text-sm text-zinc-500">
            Lives you buy anywhere work everywhere.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {QUICK_PICKS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setQuantity(n)}
              className={
                "rounded-xl border px-4 py-2 text-sm font-medium transition " +
                (quantity === n
                  ? "border-brass bg-brass/10 text-zinc-900"
                  : "border-zinc-200 text-zinc-600 hover:border-zinc-300")
              }
            >
              {n} {n === 1 ? "life" : "lives"}
            </button>
          ))}
        </div>

        <label className="block">
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
            className="mt-1 w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-zinc-900 outline-none focus:border-brass"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
