"use client";

// The contributor's own boxes.
//
// A box is one of four things: a draft you can still change your mind about,
// something waiting to be paid for, live and under siege, or cracked. The card
// says which, and puts the one action that matters next to it.
//
// The line between unpublished and funded is the important one, and it is
// *publication*, not creation: a draft and a box whose checkout was abandoned
// are equally unplayed, and both are yours to edit or throw away. The moment
// money is behind it, players start spending real lives against that exact
// password — so it can't be edited, can't be deleted, and the reward can only
// go up.

import Link from "next/link";
import { useState } from "react";
import { isTransfer, openCheckout, type CheckoutStart } from "@/lib/checkout";
import { PayMethodPicker } from "@/components/player/pay-method";
import { TransferSheet } from "@/components/player/transfer-sheet";
import type { PayMethod } from "@/lib/checkout-server";
import { ExternalLink, Trash2, TrendingUp, Zap } from "lucide-react";
import { SafeArt } from "@/components/safe/safe-art";
import { Boxy } from "@/components/art/boxy";
import { formatNaira, rewardLabel, splitFunding } from "@/lib/game/rewards";
import { MAX_FUNDING_KOBO } from "@/lib/constants";
import { plural } from "@/lib/plural";
import type { OwnedBox } from "@/lib/types";
import { DifficultyBadge } from "@/components/difficulty-badge";
import { RevenueEstimate } from "./revenue-estimate";
import { GHOST, INPUT, Panel, PRIMARY, ShareButton, StatusPill } from "./shared";

export function BoxesPanel({
  boxes,
  onBuild,
  onChanged,
}: {
  boxes: OwnedBox[];
  onBuild: () => void;
  onChanged: () => void;
}) {
  if (boxes.length === 0) {
    return (
      <Panel>
        <div className="py-4 text-center">
          <Boxy mood="happy" className="mx-auto size-28" />
          <p className="mt-1 text-lg font-black tracking-tight">Nothing up yet.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-400">
            Put a reward behind a password and share the link — that’s the
            whole thing.
          </p>
          <button
            type="button"
            onClick={onBuild}
            style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
            className="btn-chunky mx-auto mt-5 block rounded-2xl bg-brass px-6 py-3 text-ink"
          >
            Build your first spendbox
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      {boxes.map((box) => (
        <BoxRow key={box.id} box={box} onChanged={onChanged} />
      ))}
    </div>
  );
}

function BoxRow({ box, onChanged }: { box: OwnedBox; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raising, setRaising] = useState(false);
  const [method, setMethod] = useState<PayMethod>("transfer");
  const [transfer, setTransfer] = useState<{
    details: NonNullable<CheckoutStart["transfer"]>;
    reference: string;
  } | null>(null);

  async function checkout(raiseToKobo?: number) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/contributor/boxes/${box.id}/fund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(raiseToKobo ? { raiseToKobo, method } : { method }),
    });
    const body = (await res.json().catch(() => ({}))) as CheckoutStart & {
      result?: string;
      error?: string;
    };
    if (res.ok && isTransfer(body)) {
      setBusy(false);
      setTransfer({ details: body.transfer, reference: body.reference });
      return;
    }
    if (res.ok && (body.accessCode || body.authorizationUrl)) {
      const outcome = await openCheckout(body, () => onChanged());
      if (outcome === "redirected") return;
      setBusy(false);
      if (outcome === "failed") setError("Couldn't open checkout. Try again in a moment.");
      return;
    }
    setBusy(false);
    if (body.result === "already_live") {
      onChanged();
      return;
    }
    setError(
      body.error === "payments_unavailable"
        ? "Payments aren't switched on yet."
        : body.error === "not_an_increase"
          ? "A reward can only go up."
          : "Couldn't open checkout. Try again in a moment."
    );
  }

  async function discard() {
    if (!window.confirm(`Delete “${box.title}”? This can't be undone.`)) return;
    setBusy(true);
    const res = await fetch(`/api/contributor/boxes/${box.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onChanged();
    else setError("Couldn't delete that. A box that's been paid for is permanent.");
  }

  const unpublished = box.status === "draft" || box.status === "funding";

  return (
    <article className="panel rounded-3xl p-4">
      <header className="flex items-start gap-3">
        <SafeArt
          design={box.design}
          mood={box.status === "unlocked" ? "open" : "idle"}
          className="size-12 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-zinc-100">{box.title}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {box.length} characters ·{" "}
            {unpublished
              ? `${formatNaira(box.fundingKobo)} to fund`
              : `you paid ${formatNaira(box.fundingKobo)}`}
          </p>
        </div>
        <StatusPill status={box.status} />
      </header>

      <div className="mt-2">
        <DifficultyBadge difficulty={box.difficulty} />
      </div>

      {/*
        Stacked, not three across.
        A seven-figure reward and a six-figure attempt count do not fit in a
        third of a card on a phone: the figures wrapped mid-number and the
        estimate underneath ran into them. One row each, label left and figure
        right, and every one of them has the whole width when it needs it.
      */}
      <dl className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl bg-black/25">
        <Figure label="Reward" value={rewardLabel(box.rewardKobo)} accent />
        <Figure label="You've earned" value={formatNaira(box.earnedKobo)} />
        <Figure
          label="Attempts"
          value={box.attemptsCount.toLocaleString("en-NG")}
          hint={plural(box.playersCount, "hunter")}
        />
      </dl>

      {/* Its own row. It used to butt straight up against the figures above
          with nothing between them, so the estimate read as a fourth stat and
          its border ran into theirs. */}
      <div className="mt-3">
        <RevenueEstimate
          rewardKobo={box.rewardKobo}
          hunters={box.playersCount}
          earnedKobo={box.earnedKobo}
        />
      </div>

      {box.status === "unlocked" && (
        <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-400">
          Cracked by {box.unlockedBy ?? "a player"} after{" "}
          {plural(box.attemptsCount, "attempt")}.
          An opened box can’t be played again — the{" "}
          {rewardLabel(box.rewardKobo)} is on its way to them.
        </p>
      )}

      {unpublished && (
        <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-400">
          {box.status === "draft"
            ? "This is a draft. No one can see it, and no funds have been committed."
            : "Waiting on payment. No one can see it, and no funds have been committed yet."}
          {" "}
          Fund the safe to make it live. Once it&apos;s live, the password, safe
          name, and all settings become permanent and cannot be changed. The only
          thing you can modify afterward is the reward amount — and only by
          increasing it.
        </p>
      )}

      <div className="mt-3">
        <PayMethodPicker value={method} onPick={setMethod} disabled={busy} />
      </div>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {transfer && (
        <TransferSheet
          transfer={transfer.details}
          reference={transfer.reference}
          what={box.title}
          onPaid={() => {
            setTransfer(null);
            onChanged();
          }}
          onClose={() => setTransfer(null)}
        />
      )}

      {raising && (
        <RaiseForm
          box={box}
          busy={busy}
          onCancel={() => setRaising(false)}
          onRaise={(to) => void checkout(to)}
        />
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        {unpublished ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void checkout()}
              className={GHOST}
            >
              <span className="flex items-center gap-1.5">
                <Zap className="size-4" aria-hidden />
                {busy ? "Opening checkout…" : `Fund it — ${formatNaira(box.fundingKobo)}`}
              </span>
            </button>
            {box.editable && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void discard()}
                className={`${GHOST} text-red-400`}
              >
                <span className="flex items-center gap-1.5">
                  <Trash2 className="size-4" aria-hidden />
                  Delete
                </span>
              </button>
            )}
          </>
        ) : (
          <>
            <Link href={`/b/${box.slug}`} className={GHOST}>
              <span className="flex items-center gap-1.5">
                <ExternalLink className="size-4" aria-hidden />
                Open
              </span>
            </Link>
            {box.status === "live" && (
              <>
                <ShareButton slug={box.slug} title={box.title} />
                {/* Not on a promo safe. Its pot is ours rather than 70% of
                    what was paid for it, so there is nothing here to raise —
                    the funding route refuses one regardless, and offering a
                    button that opens a checkout only to be turned down is
                    worse than not offering it. */}
                {box.kind !== "promo" && (
                  <button
                    type="button"
                    onClick={() => setRaising((r) => !r)}
                    className={GHOST}
                  >
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="size-4" aria-hidden />
                      Raise reward
                    </span>
                  </button>
                )}
              </>
            )}
          </>
        )}

        {box.powerUpsSold > 0 && (
          <span className="ml-auto text-xs text-zinc-500">
            {plural(box.powerUpsSold, "power-up")} sold
          </span>
        )}
      </footer>
    </article>
  );
}

/**
 * Raising a live box's reward.
 *
 * Only the difference is charged, and only upwards — the field won't accept
 * anything at or below what's already behind the box, and the server refuses
 * it too. A player weighing up weeks of lives has to be able to trust the
 * number they read on the card.
 */
function RaiseForm({
  box,
  busy,
  onCancel,
  onRaise,
}: {
  box: OwnedBox;
  busy: boolean;
  onCancel: () => void;
  onRaise: (toKobo: number) => void;
}) {
  const [naira, setNaira] = useState("");
  const toKobo = Math.round(Number(naira || 0) * 100);
  const valid = toKobo > box.fundingKobo && toKobo <= MAX_FUNDING_KOBO;
  const extra = valid ? toKobo - box.fundingKobo : 0;
  const split = valid ? splitFunding(toKobo) : null;

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-white/5 p-3">
      <p className="text-xs text-zinc-400">
        Currently {formatNaira(box.fundingKobo)} in, {formatNaira(box.rewardKobo)}{" "}
        reward. Raise the total to:
      </p>
      <div className="relative">
        <span className="absolute inset-y-0 left-4 flex items-center text-zinc-500">₦</span>
        <input
          inputMode="numeric"
          autoFocus
          value={naira}
          onChange={(e) => setNaira(e.target.value.replace(/[^\d]/g, ""))}
          placeholder={String(Math.round(box.fundingKobo / 100) * 2)}
          className={`${INPUT} pl-8 font-mono`}
        />
      </div>

      {split && (
        <p className="text-xs text-zinc-400">
          You’d pay <strong className="text-zinc-200">{formatNaira(extra)}</strong>{" "}
          more now, and the reward becomes{" "}
          <strong className="text-brass">{formatNaira(split.rewardKobo)}</strong>.
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!valid || busy}
          onClick={() => onRaise(toKobo)}
          className={`flex-1 ${PRIMARY} py-2.5 text-sm`}
        >
          {busy ? "Opening checkout…" : "Raise it"}
        </button>
        <button type="button" onClick={onCancel} className={GHOST}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 text-[11px] uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="min-w-0 text-right">
        <span
          className={
            "block truncate font-mono text-sm font-bold " +
            (accent ? "text-brass" : "text-zinc-200")
          }
        >
          {value}
        </span>
        {hint && <span className="block text-[11px] text-zinc-600">{hint}</span>}
      </dd>
    </div>
  );
}
