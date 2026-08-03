"use client";

// The contributor's own boxes.
//
// A box is one of three things at any moment: waiting to be paid for, live and
// being attacked, or cracked. The card says which, and puts the one action
// that matters next to it — fund it, share it, or nothing at all.

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Users } from "lucide-react";
import { formatNaira } from "@/lib/game/stakes";
import type { OwnedBox } from "@/lib/types";
import { Empty, GHOST, Panel, ShareButton, StatusPill } from "./shared";

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
          Nothing up yet. Stake a prize behind a password and share the link —
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

  async function fund() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/contributor/boxes/${box.id}/fund`, { method: "POST" });
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
        : "Couldn't open checkout. Try again in a moment."
    );
  }

  return (
    <article className="panel rounded-2xl p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-zinc-100">{box.title}</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {box.length} characters · staked {formatNaira(box.stakeKobo)}
          </p>
        </div>
        <StatusPill status={box.status} />
      </header>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Figure label="Prize" value={formatNaira(box.prizeKobo)} accent />
        <Figure label="You've earned" value={formatNaira(box.earnedKobo)} />
        <Figure
          label="Attempts"
          value={String(box.attemptsCount)}
          hint={`${box.playersCount} ${box.playersCount === 1 ? "player" : "players"}`}
        />
      </div>

      {box.status === "unlocked" && (
        <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-400">
          Cracked by {box.unlockedBy ?? "a player"}. An opened box can&apos;t be
          played again — the {formatNaira(box.prizeKobo)} is on its way to them.
        </p>
      )}

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        {box.status === "funding" ? (
          <button type="button" disabled={busy} onClick={() => void fund()} className={GHOST}>
            {busy ? "Opening checkout…" : `Fund it — ${formatNaira(box.stakeKobo)}`}
          </button>
        ) : (
          <>
            <Link href={`/b/${box.slug}`} className={GHOST}>
              <span className="flex items-center gap-1.5">
                <ExternalLink className="size-4" aria-hidden />
                Open
              </span>
            </Link>
            {box.status === "live" && <ShareButton slug={box.slug} title={box.title} />}
          </>
        )}

        {box.powerUpsSold > 0 && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500">
            <Users className="size-3.5" aria-hidden />
            {box.powerUpsSold} power-up{box.powerUpsSold === 1 ? "" : "s"} sold
          </span>
        )}
      </footer>
    </article>
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
