"use client";

// Buying lives, framed honestly: the free refill is stated first, and the
// purchase is the alternative rather than the point.
//
// Three things can be bought here, and they answer the same question in three
// different units. Lives are *quantity* — a fixed number of guesses, yours
// forever, spendable anywhere. Second Wind is *time* — a window on this box
// with no limit at all and no life spent. Life Bank is *headroom* — a week of
// a taller pool, so a day away banks a day's accrual instead of overflowing at
// seven.
//
// Somebody who has run dry mid-hunt wants one of the three depending entirely
// on how long they have, and making them find any of them on a different
// screen was hiding the answer to the question they just asked. Life Bank was
// on the power-up shelf until now, which was the wrong window entirely:
// everything there is a fact about one password, and this changes the pool
// every box is played from.
//
// There is a fourth answer that costs nothing, and it belongs here for the same
// reason as the other three: somebody out of lives is the only person who ever
// really wants their invite link. Sending it to a friend is five lives each,
// immediately — so the share sits beside the free-refill note, above everything
// with a price on it, instead of only on the profile screen.

import { useState } from "react";
import { isTransfer, openCheckout, type CheckoutStart } from "@/lib/checkout";
import { PayMethodPicker } from "./pay-method";
import { TransferSheet } from "./transfer-sheet";
import type { PayMethod } from "@/lib/checkout-server";
import { Check, Heart, Infinity as InfinityIcon, Share2, Tag } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import {
  LIFE_PURCHASE_MAX,
  LIVES_MAX,
  REFERRAL_BONUS_LIVES,
} from "@/lib/constants";
import { useInviteShare } from "./invite-share";
import { LifeBankArt, PowerUpArt } from "@/components/art/power-up-art";
import {
  discountedKobo,
  LIFE_BANK_MAX,
  secondWindLabel,
  type Offering,
} from "@/lib/game/power-ups";
import { formatNaira } from "@/lib/game/rewards";
import { usePlayer } from "./player-context";
import { countdown, useNow } from "./lives-badge";

const QUICK_PICKS = [1, 3, 5, 10];

/**
 * What a week of Life Bank costs when nothing has told us otherwise.
 *
 * The real figure is admin-editable and arrives with the play view. This is
 * the same default the server uses, kept here so the dialog can open from the
 * header — where there is no box and therefore no view — without a round trip.
 */
const LIFE_BANK_FALLBACK_KOBO = 2_500 * 100;

type Buying = "lives" | "wind" | "bank";

export function BuyLivesDialog({
  onClose,
  /** The box they were hunting, if they were. Its contributor takes 70%. */
  slug,
  contributor,
  /**
   * Second Wind, priced against this box. Absent when there is no box — from
   * the header there is nothing for a window of unlimited guesses to apply to.
   */
  secondWind,
  lifeBankKobo = LIFE_BANK_FALLBACK_KOBO,
}: {
  onClose: () => void;
  slug?: string;
  contributor?: string | null;
  secondWind?: Offering | null;
  /** A week of the raised ceiling. Admin-set; this is only the fallback. */
  lifeBankKobo?: number;
}) {
  const { player, refresh } = usePlayer();
  // Off the player rather than a prop: this dialog opens from the game, the
  // header and the profile, and only one of those has a box in front of it.
  const lifeDiscount = player.lifeDiscount;
  // The discount's clock first: it is the shorter of the two and the only one
  // that costs the player money to miss.
  const now = useNow(lifeDiscount?.expiresAt ?? player.nextLifeAt);
  const [quantity, setQuantity] = useState(3);
  const [buying, setBuying] = useState<Buying>("lives");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<PayMethod>("transfer");
  // The free way out of this dialog. Null until an address is verified, and
  // there is nothing to share before then.
  const { copied, share } = useInviteShare(player.inviteCode);
  /* Set once a transfer charge comes back; the sheet owns the rest. */
  const [transfer, setTransfer] = useState<{
    details: NonNullable<CheckoutStart["transfer"]>;
    reference: string;
  } | null>(null);

  const windRunning =
    !!secondWind?.activeUntil && new Date(secondWind.activeUntil).getTime() > now;
  const canWind = !!secondWind && !!slug && secondWind.available && !windRunning;
  const wind = buying === "wind" && canWind;
  // A raised ceiling is already running when the pool holds more than the
  // platform default. Buying again extends it rather than replacing it, so it
  // is never hidden — only relabelled.
  const bank = buying === "bank";
  const bankRunning = player.livesMax > LIVES_MAX;

  async function checkout() {
    if (wind && secondWind && slug) return buyWind();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/player/lives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        bank ? { lifeBank: true, slug, method } : { quantity, slug, method }
      ),
    });
    const body = (await res.json().catch(() => ({}))) as CheckoutStart & {
      error?: string;
    };
    if (res.ok && isTransfer(body)) {
      setBusy(false);
      setTransfer({ details: body.transfer, reference: body.reference });
      return;
    }
    if (res.ok && (body.accessCode || body.authorizationUrl)) {
      const outcome = await openCheckout(body, () => {
        void refresh();
        onClose();
      });
      if (outcome === "redirected") return;
      setBusy(false);
      if (outcome === "failed") {
        setError("Couldn't start that payment. Try again in a moment.");
      }
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
      body: JSON.stringify({ kind: "second_wind", method }),
    });
    const body = (await res.json().catch(() => ({}))) as CheckoutStart & {
      error?: string;
    };
    if (res.ok && isTransfer(body)) {
      setBusy(false);
      setTransfer({ details: body.transfer, reference: body.reference });
      return;
    }
    if (res.ok && (body.accessCode || body.authorizationUrl)) {
      const outcome = await openCheckout(body, () => {
        void refresh();
        onClose();
      });
      if (outcome === "redirected") return;
      setBusy(false);
      if (outcome === "failed") {
        setError("Couldn’t open checkout. Try again in a moment.");
      }
      return;
    }
    setBusy(false);
    setError(
      body.error === "payments_unavailable"
        ? "Payments aren’t switched on yet."
        : "Couldn’t open checkout. Try again in a moment."
    );
  }

  // The discount applies to lives and not to Second Wind — that one is a
  // power-up and settles through the power-up till, where the other kind of
  // drop lives.
  const off =
    lifeDiscount && new Date(lifeDiscount.expiresAt).getTime() > now
      ? lifeDiscount.amount
      : 0;
  const livesFull = quantity * player.lifePriceKobo;
  const livesTotal = discountedKobo(livesFull, off);
  const total = wind && secondWind ? secondWind.priceKobo : bank ? lifeBankKobo : livesTotal;

  if (transfer) {
    return (
      <TransferSheet
        transfer={transfer.details}
        reference={transfer.reference}
        what={wind ? secondWindLabel() : bank ? "Life Bank, one week" : `${quantity} lives`}
        onPaid={() => {
          void refresh();
          onClose();
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <Modal
      title="Keep going"
      subtitle={`Buy guesses, ${secondWindLabel()} of them, or somewhere to keep more.`}
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
          {busy ? (
            "Opening checkout…"
          ) : wind ? (
            `Take the ${secondWindLabel()} · ${formatNaira(total)}`
          ) : bank ? (
            `${bankRunning ? "Another week" : "Take the week"} · ${formatNaira(total)}`
          ) : (
            <>
              Pay{" "}
              {off > 0 && (
                <span className="text-sm font-bold text-ink/50 line-through">
                  {formatNaira(livesFull)}
                </span>
              )}{" "}
              {formatNaira(total)}
            </>
          )}
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

        {/*
          The free alternative, stated before anything with a price on it. It
          is one gesture — the share sheet on a phone, the clipboard everywhere
          else — because a link that needs to be selected and copied by hand is
          a link nobody sends mid-hunt.
        */}
        {player.inviteCode && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-brass/40 bg-brass/10 px-3 py-2.5">
            <p className="min-w-0 flex-1 text-sm text-brass">
              <strong>Or get lives free.</strong> Send a friend your link — when
              they join, you both get {REFERRAL_BONUS_LIVES} lives, straight
              away.
            </p>
            <button
              type="button"
              onClick={() => void share()}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brass px-3 py-2 text-sm font-bold text-ink transition hover:bg-brass-bright"
            >
              {copied ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Share2 className="size-4" aria-hidden />
              )}
              {copied ? "Copied" : "Share"}
            </button>
          </div>
        )}

        {off > 0 && !wind && !bank && (
          <p className="flex items-center gap-2 rounded-xl border-2 border-sky/40 bg-sky/15 px-3 py-2.5 text-sm font-bold text-sky">
            <Tag className="size-4 shrink-0" aria-hidden />
            {off}% off this order — {countdown(lifeDiscount!.expiresAt, now)} to use it.
          </p>
        )}

        {player.bonusLivesPending > 0 && (
          <p className="rounded-xl bg-brass/10 px-3 py-2.5 text-sm text-brass">
            <strong>
              +{player.bonusLivesPending} free{" "}
              {player.bonusLivesPending === 1 ? "life" : "lives"}
            </strong>{" "}
            banked from an earlier invite land with this one. You’ll get{" "}
            {quantity + player.bonusLivesPending} in total.
          </p>
        )}

        {contributor && (
          <p className="text-sm text-zinc-500">
            Lives you buy anywhere work everywhere.
          </p>
        )}

        {/*
          Three things, and they answer the same question in different units.
          Lives are *quantity* — a fixed number of guesses, yours forever.
          Second Wind is *time* — a window on this box with no limit at all.
          Life Bank is *headroom* — a week of a taller pool, so an evening away
          banks a day's accrual instead of overflowing at seven.

          Life Bank used to be on the power-up shelf, which was the wrong
          window entirely: everything else there is a fact about one password,
          and this changes the pool every box is played from.
        */}
        <div className="grid gap-2 sm:grid-cols-2">
          <Option
            index={0}
            on={buying === "lives"}
            onPick={() => setBuying("lives")}
            icon={<Heart className="size-6 fill-berry text-berry" aria-hidden />}
            title="Lives"
            body="A guess each. Yours forever, on any safe."
            price={`${formatNaira(player.lifePriceKobo)} each`}
          />
          {canWind && secondWind && (
            <Option
              index={1}
              on={buying === "wind"}
              onPick={() => setBuying("wind")}
              icon={<PowerUpArt kind="second_wind" className="size-7" />}
              title="Second Wind"
              body={`Immortal for ${secondWindLabel()} — on this safe only.`}
              price={formatNaira(secondWind.priceKobo)}
            />
          )}
          <Option
            index={2}
            on={bank}
            onPick={() => setBuying("bank")}
            icon={<LifeBankArt className="size-7" />}
            title="Life Bank"
            body={`Hold ${LIFE_BANK_MAX} lives, instead of ${LIVES_MAX}, for a week.`}
            price={formatNaira(lifeBankKobo)}
          />
        </div>

        {bank && bankRunning && (
          <p className="rounded-xl border-2 border-berry/40 bg-berry/15 px-3 py-2.5 text-sm font-bold text-berry">
            Your ceiling is already {player.livesMax}. Another week is added to
            what’s left rather than replacing it.
          </p>
        )}

        {windRunning && secondWind?.activeUntil && (
          <p className="flex items-center gap-2 rounded-xl border-2 border-mint/40 bg-mint/15 px-3 py-2.5 text-sm font-bold text-mint">
            <InfinityIcon className="size-4" aria-hidden />
            Second Wind is already running — {countdown(secondWind.activeUntil, now)}{" "}
            left, and every guess is free.
          </p>
        )}

        <div className={"flex flex-wrap gap-2 " + (wind || bank ? "hidden" : "")}>
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

        <label className={"block " + (wind || bank ? "hidden" : "")}>
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

        <PayMethodPicker value={method} onPick={setMethod} disabled={busy} />

        {error && (
          <p className="rounded-xl bg-berry/15 px-3 py-2 text-sm font-bold text-berry">{error}</p>
        )}
      </div>
    </Modal>
  );
}

/**
 * One of the three things you can buy here.
 *
 * They arrive one after another rather than all at once — a hundred and eighty
 * milliseconds apart — so the eye is walked across the three options instead of
 * being handed a wall of them. The chosen one lifts and keeps a lit ring, which
 * is the only state on this dialog that decides what the button at the bottom
 * charges for.
 */
function Option({
  index,
  on,
  onPick,
  icon,
  title,
  body,
  price,
}: {
  index: number;
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
      style={{ ["--i" as string]: index }}
      className={
        "animate-fade-up stagger flex flex-col items-start gap-1 rounded-2xl border-2 p-3 text-left transition duration-200 " +
        (on
          ? "-translate-y-0.5 border-brass bg-brass/15 shadow-[0_0_0_3px_var(--brass-deep)]"
          : "border-white/12 bg-white/5 hover:-translate-y-0.5 hover:border-white/30")
      }
    >
      <span
        className={
          "flex items-center gap-2 font-black tracking-tight transition " +
          (on ? "[&>*:first-child]:scale-110" : "")
        }
      >
        {icon}
        {title}
      </span>
      <span className="text-xs leading-snug text-zinc-400">{body}</span>
      <span className="mt-0.5 font-mono text-sm font-black text-brass">{price}</span>
    </button>
  );
}
