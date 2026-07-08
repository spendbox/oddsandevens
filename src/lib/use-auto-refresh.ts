"use client";

import { useEffect, useRef } from "react";

// Periodically re-run `refetch`, and also re-run it whenever the tab regains
// focus/visibility, so a page reflects new plays, new customers, redemptions,
// and deletions without a manual reload. `refetch` should refresh in place
// (no loading spinner) so the poll stays invisible. Polling pauses while the
// tab is hidden to avoid pointless background work.
export function useAutoRefresh(refetch: () => void, intervalMs = 20000) {
  const saved = useRef(refetch);
  // Keep the latest callback without re-arming the interval (updated after
  // render, never during it).
  useEffect(() => {
    saved.current = refetch;
  });

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") saved.current();
    };
    const id = setInterval(run, intervalMs);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [intervalMs]);
}
