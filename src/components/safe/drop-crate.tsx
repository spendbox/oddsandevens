"use client";

// Something falls out of the sky.
//
// A hunt on a hard box is two thousand guesses with nothing in between them,
// and the two places a player quits are the same two every time: out of lives,
// or five guesses that went nowhere. A drop is aimed at exactly those moments —
// a crate that floats in, hangs for a minute or two, and is gone.
//
// It is never a sale. It is free lives, or a share off one power-up, and the
// terms come from the server: this component asks for one and shows what it is
// given. A discount the browser could name is a discount the browser would.

import { useEffect, useState } from "react";
import { Check, Gift, Timer, X } from "lucide-react";
import { POWER_UPS, secondWindLabel } from "@/lib/game/power-ups";
import type { Drop, DropKind } from "@/lib/types";
import type { Applied } from "./use-drops";

/** The things a crate can hold, and how each one is said. */
const TONES = {
  free_lives: { face: "bg-berry", lip: "var(--berry-deep)" },
  free_second_wind: { face: "bg-mint", lip: "var(--mint-deep)" },
  power_up_discount: { face: "bg-grape", lip: "var(--grape-deep)" },
  life_discount: { face: "bg-sky", lip: "var(--sky-deep)" },
  free_power_up: { face: "bg-brass", lip: "var(--brass-deep)" },
} as const;

/** One reward, as a line somebody reads in a second and a half. */
function title(kind: DropKind, amount: number, powerUp: string | null): string {
  const name = powerUp ? POWER_UPS[powerUp as keyof typeof POWER_UPS]?.name : null;
  switch (kind) {
    case "free_lives":
      return `${amount} free ${amount === 1 ? "life" : "lives"}`;
    case "free_second_wind":
      return `Free Second Wind · ${secondWindLabel()}`;
    case "free_power_up":
      return `${name ?? "A power-up"}, free`;
    case "life_discount":
      return `${amount}% off your next lives`;
    default:
      return `${amount}% off ${name ?? "a power-up"}`;
  }
}

/*
 * A crate that has already applied itself.
 *
 * Not a button and not dismissable — there is nothing to decide and nothing to
 * do. What it carries instead is the only thing still worth knowing: what they
 * now have, and how long they have it. It takes itself away when that runs
 * out, or after a few seconds when there is no clock on it.
 */
export function DropApplied({
  applied,
  onDone,
  className = "",
}: {
  applied: Applied;
  onDone: () => void;
  className?: string;
}) {
  const tone = TONES[applied.kind] ?? TONES.power_up_discount;
  const until = applied.expiresAt ?? applied.secondWindUntil;
  const left = useCountdown(until, onDone, SHOW_MS);

  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      style={{ animation: "drop-in-air 0.5s cubic-bezier(0.34,1.5,0.5,1) both" }}
      role="status"
    >
      <span
        style={{ "--btn-lip": tone.lip } as React.CSSProperties}
        className={"btn-chunky flex items-center gap-2 rounded-2xl px-3 py-2 text-left text-ink " + tone.face}
      >
        <Check className="size-5 shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="block text-sm font-black leading-tight">
            {applied.note ?? title(applied.kind, applied.amount, applied.powerUp)}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide opacity-70">
            {until ? (
              <>
                <Timer className="size-3" aria-hidden />
                Yours for {left}
              </>
            ) : applied.kind === "free_lives" ? (
              "Straight into your pool"
            ) : (
              "Applied"
            )}
          </span>
        </span>
      </span>
    </div>
  );
}

export function DropCrate({
  drop,
  onClaim,
  onDismiss,
  className = "",
}: {
  drop: Drop;
  onClaim: () => void;
  onDismiss: () => void;
  className?: string;
}) {
  const left = useCountdown(drop.expiresAt, onDismiss);
  const tone = TONES[drop.kind] ?? TONES.power_up_discount;
  // Only a floating reward reaches this component, and the whole tap is the
  // choice of safe — so the line says which safe it would be spent on.
  const heading = `${title(drop.kind, drop.amount, drop.powerUp)} — use it here`;

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 ${className}`}
      style={{ animation: "drop-in-air 0.5s cubic-bezier(0.34,1.5,0.5,1) both" }}
    >
      <button
        type="button"
        onClick={onClaim}
        style={{ "--btn-lip": tone.lip } as React.CSSProperties}
        className={
          "btn-chunky drop-bob flex items-center gap-2 rounded-2xl px-3 py-2 text-left text-ink " +
          tone.face
        }
      >
        <Gift className="size-5 shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="block text-sm font-black leading-tight">{heading}</span>
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide opacity-70">
            <Timer className="size-3" aria-hidden />
            {left} left
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Not now"
        className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-white/20 bg-background/85 text-zinc-400 transition hover:text-foreground"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** How long an announcement with no clock on it stays up. */
const SHOW_MS = 7_000;

/**
 * Time left, to the second, and it takes itself away when there is none.
 *
 * `after` is for the rewards that have no clock — free lives are simply
 * yours — where there is still a moment to end. Without it a "+5 free lives"
 * banner would sit over the game for the rest of the session.
 */
function useCountdown(iso: string | null, onDone: () => void, after?: number): string {
  const [left, setLeft] = useState(() => (iso ? remaining(iso) : "gone"));

  useEffect(() => {
    if (!iso) {
      if (after === undefined) return;
      const id = window.setTimeout(onDone, after);
      return () => window.clearTimeout(id);
    }
    const id = window.setInterval(() => {
      const next = remaining(iso);
      setLeft(next);
      if (next === "gone") {
        window.clearInterval(id);
        onDone();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [iso, onDone, after]);

  return left;
}

function remaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "gone";
  const total = Math.round(ms / 1000);
  // A minted crate lasts minutes and is counted down to the second, because
  // the seconds are the pressure. A streak reward lasts a week and has none:
  // counting a week down in minutes would read as "10079:58 left".
  if (total >= 3600) {
    const hours = Math.floor(total / 3600);
    return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h`;
  }
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
