"use client";

// One place that knows who the player is and how many lives they have left.
//
// The life count appears in the header, on every box card, and inside the
// game, and all three have to agree the instant a run starts. Rather than
// three components polling the same route, the provider owns the state and
// hands down a `refresh` that any of them can call after doing something that
// spends or earns a life.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { LIVES_MAX, LIFE_PRICE_KOBO } from "@/lib/constants";
import type { PlayerState } from "@/lib/types";

const ANONYMOUS: PlayerState = {
  email: null,
  lives: LIVES_MAX,
  livesMax: LIVES_MAX,
  nextLifeAt: null,
  lifePriceKobo: LIFE_PRICE_KOBO,
  inviteCode: null,
  bonusLivesPending: 0,
};

/** Where a `?ref=` code waits between arriving and being claimable. */
const REF_KEY = "spendbox.ref";

interface PlayerContextValue {
  player: PlayerState;
  /** False until the first fetch lands, so nothing flashes the wrong number. */
  ready: boolean;
  verified: boolean;
  refresh: () => Promise<void>;
  /** Called by the verify dialog once an address is proved. */
  adopt: (player: PlayerState) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<PlayerState>(ANONYMOUS);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/player/state", { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { player: PlayerState };
        setPlayer(body.player);
      }
    } catch {
      // Offline or mid-deploy: keep whatever we last knew rather than
      // pretending the player has no lives.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    async function load() {
      await refresh();
    }
    void load();
  }, [refresh]);

  /**
   * An invite code, from arrival to claim.
   *
   * These two things happen minutes or days apart: somebody follows a `?ref=`
   * link, plays for a while as a stranger, and only verifies an address when
   * they run out of lives or win something. There is nobody to attach the code
   * to until that happens, so it waits in `localStorage` and is replayed the
   * first time we know who they are.
   *
   * The server treats a stale, wrong or already-used code as a no-op, so this
   * doesn't have to be careful about firing twice — it just clears the key
   * once the round trip is done, whatever the answer was.
   */
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("ref");
    if (fromUrl) {
      window.localStorage.setItem(REF_KEY, fromUrl);
      // Take it out of the URL: a shared screenshot of somebody else's link
      // shouldn't keep re-attributing them.
      const url = new URL(window.location.href);
      url.searchParams.delete("ref");
      window.history.replaceState({}, "", url.toString());
    }

    if (!player.email) return;
    const pending = window.localStorage.getItem(REF_KEY);
    if (!pending) return;

    let cancelled = false;
    async function claim() {
      try {
        await fetch("/api/player/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: pending }),
        });
      } catch {
        // Leave the key in place; the next page load tries again.
        return;
      }
      if (!cancelled) window.localStorage.removeItem(REF_KEY);
    }
    void claim();
    return () => {
      cancelled = true;
    };
  }, [player.email]);

  /**
   * Lives arrive on the hour, so the header would otherwise sit on a stale
   * number until something else happened. Re-checking when the tab comes back
   * to the front catches the common case — someone returning after a while —
   * without polling a route on a timer forever.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      player,
      ready,
      verified: !!player.email,
      refresh,
      adopt: setPlayer,
    }),
    [player, ready, refresh]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside a PlayerProvider");
  return value;
}
