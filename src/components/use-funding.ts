"use client";

// The funding ladder, in a browser.
//
// It used to be five numbers in `rewards.ts` that any component could import.
// An admin sets them now, so a component has to *ask* — and until the answer
// arrives it shows the built-in numbers, which is the same fallback the server
// applies to a settings row nobody has written. The server is the one that
// decides in the end: every floor printed here is checked again by the create
// route against the ladder it loads itself.

import { useEffect, useState } from "react";
import { DEFAULT_FUNDING_LADDER, type FundingLadder } from "@/lib/game/rewards";

export function useFundingLadder(): FundingLadder {
  const [live, setLive] = useState<FundingLadder | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/funding");
      if (!res.ok || cancelled) return;
      const body = (await res.json()) as { ladder?: FundingLadder };
      if (!cancelled && body.ladder) setLive(body.ladder);
    })().catch(() => {
      // Offline, or the settings row is unreachable. The built-in ladder is a
      // perfectly good answer, and nothing is charged on the strength of it.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return live ?? DEFAULT_FUNDING_LADDER;
}
