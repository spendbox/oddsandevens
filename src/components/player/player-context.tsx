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
};

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
