"use client";

// "3d 4h" / "2h 11m" / "44s" until a moment passes, ticking once a second.
// Used by both the game page and the hub, so a week closes at the same visible
// instant wherever the player is looking.

import { useEffect, useState } from "react";

export function useCountdown(target: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target) return null;
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return null;

  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
