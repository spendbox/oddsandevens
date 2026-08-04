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
import { Gift, Timer, X } from "lucide-react";
import { POWER_UPS, SECOND_WIND_HOURS } from "@/lib/game/power-ups";
import type { Drop } from "@/lib/types";

/** The four things a crate can hold, and how each one is said. */
const TONES = {
  free_lives: { face: "bg-berry", lip: "var(--berry-deep)" },
  free_second_wind: { face: "bg-mint", lip: "var(--mint-deep)" },
  power_up_discount: { face: "bg-grape", lip: "var(--grape-deep)" },
  life_discount: { face: "bg-sky", lip: "var(--sky-deep)" },
} as const;

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
  const name = drop.powerUp ? POWER_UPS[drop.powerUp as keyof typeof POWER_UPS]?.name : null;
  const tone = TONES[drop.kind] ?? TONES.power_up_discount;

  const title =
    drop.kind === "free_lives"
      ? `${drop.amount} free ${drop.amount === 1 ? "life" : "lives"}`
      : drop.kind === "free_second_wind"
        ? `Free Second Wind · ${SECOND_WIND_HOURS === 1 ? "1 hour" : `${SECOND_WIND_HOURS} hours`}`
        : drop.kind === "life_discount"
          ? `${drop.amount}% off your next lives`
          : `${drop.amount}% off ${name ?? "a power-up"}`;

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
          <span className="block text-sm font-black leading-tight">{title}</span>
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide opacity-70">
            <Timer className="size-3" aria-hidden />
            {left}
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

/** Time left, to the second, and it takes itself away when there is none. */
function useCountdown(iso: string, onDone: () => void): string {
  const [left, setLeft] = useState(() => remaining(iso));

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = remaining(iso);
      setLeft(next);
      if (next === "gone") {
        window.clearInterval(id);
        onDone();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [iso, onDone]);

  return left;
}

function remaining(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "gone";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} left`;
}
