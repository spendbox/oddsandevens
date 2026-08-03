"use client";

// The contributor's own boxes.
//
// A box is one of four things: a draft you can still change your mind about,
// something waiting to be paid for, live and under siege, or cracked. The card
// says which, and puts the one action that matters next to it.
//
// The line between draft and funded is the important one. A draft is yours to
// edit or throw away. The moment money is behind it, players start spending
// real lives against that exact password — so it can't be edited, can't be
// deleted, and the reward can only go up.

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Trash2, TrendingUp, Zap } from "lucide-react";
import { formatNaira, rewardLabel, splitFunding } from "@/lib/game/rewards";
import { MAX_FUNDING_KOBO } from "@/lib/constants";
import { plural } from "@/lib/plural";
import type { OwnedBox } from "@/lib/types";
import { DifficultyBadge } from "@/components/difficulty-badge";
import { RevenueEstimate } from "./revenue-estimate";
import { Empty, GHOST, INPUT, Panel, PRIMARY, ShareButton, StatusPill } from "./shared";

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
        <Empty>
          Nothing up yet. Put a reward behind a password and share the link —
          that&apos;s the whole thing.
        </Empty>
        <button type="button" onClick={onBuild} className={`mx-auto block ${GHOST}`}>
          Build your first spendbox
        </button>
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

  async function checkout(raiseToKobo?: number) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/contributor/boxes/${box.id}/fund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(raiseToKobo ? { raiseToKobo } : {}),
    });
    const body = (await res.json().catch(() => ({}))) as {
      authorizationUrl?: string;
      result?: string;
      error?: string;
    };
    if (res.ok && body.authorizationUrl) {
      window.location.assign(body.authorizationUrl);
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
    if (!window.confirm(`Delete the draft “${box.title}”? This can't be undone.`)) return;
    setBusy(true);
    const res = await fetch(`/api/contributor/boxes/${box.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) onChanged();
    else setError("Couldn't delete that. Only drafts can be deleted.");
  }

  return (
    <article className="panel rounded-2xl p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-zinc-100">{box.title}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {box.length} characters · you paid {formatNaira(box.fundingKobo)}
          </p>
        </div>
        <StatusPill status={box.status} />
      </header>

      <div className="mt-2">
        <DifficultyBadge
          difficulty={box.difficulty}
          detail={{ estimatedAttempts: box.estimatedAttempts }}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Figure label="Reward" value={rewardLabel(box.rewardKobo)} accent />
        <Figure label="You've earned" value={formatNaira(box.earnedKobo)} />
        <Figure
          label="Attempts"
          value={String(box.attemptsCount)}
          hint={plural(box.playersCount, "hunter")}
        />
      </div>

      <RevenueEstimate hunters={box.playersCount} earnedKobo={box.earnedKobo} />

      {box.status === "unlocked" && (
        <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-400">
          Cracked by {box.unlockedBy ?? "a player"} after{" "}
          {plural(box.attemptsCount, "attempt")}.
          An opened box can&apos;t be played again — the{" "}
          {rewardLabel(box.rewardKobo)} is on its way to them.
        </p>
      )}

      {box.status === "draft" && (
        <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-400">
          A draft. Nobody can see it and nothing has been charged. Fund it to put
          it live — after that the password is fixed for good.
        </p>
      )}

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {raising && (
        <RaiseForm
          box={box}
          busy={busy}
          onCancel={() => setRaising(false)}
          onRaise={(to) => void checkout(to)}
        />
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        {box.status === "draft" || box.status === "funding" ? (
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
          You&apos;d pay <strong className="text-zinc-200">{formatNaira(extra)}</strong>{" "}
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
    <div className="rounded-xl bg-white/5 px-2 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={
          "mt-0.5 font-mono text-sm font-bold " + (accent ? "text-brass" : "text-zinc-200")
        }
      >
        {value}
      </p>
      {hint && <p className="text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
}
