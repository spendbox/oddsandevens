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
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { LIVES_MAX, LIFE_PRICE_KOBO } from "@/lib/constants";
import type { PlayerState } from "@/lib/types";
import { refreshPush } from "@/lib/push-client";
import { StreakGate } from "@/components/player/streak-dialog";
import {
  arrivedAt,
  getServerSnapshot,
  getSnapshot,
  guideTo,
  subscribe,
  type SpendHint,
} from "@/components/player/spend-hint";

const ANONYMOUS: PlayerState = {
  email: null,
  lives: LIVES_MAX,
  livesMax: LIVES_MAX,
  nextLifeAt: null,
  lifePriceKobo: LIFE_PRICE_KOBO,
  inviteCode: null,
  bonusLivesPending: 0,
  lifeDiscount: null,
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
  /**
   * The control a just-claimed reward is spent at, while it is still unspent.
   * Null almost always — this is the exception, not a standing state.
   */
  spendHint: SpendHint | null;
  /** Point at a till. Called by the streak dialog as it closes. */
  guideTo: typeof guideTo;
  /** They arrived. Clears the hint if it was pointing here, and nothing if not. */
  arrivedAt: typeof arrivedAt;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({
  /**
   * Who the server already knows this is.
   *
   * Every page that mounts this resolves the player from the session cookie
   * and hands it over, so the first paint is correct. Without it the provider
   * starts as a stranger and corrects itself a round trip later — which on a
   * page you are signed into reads as being asked to sign in again.
   */
  initial,
  children,
}: {
  initial?: PlayerState;
  children: ReactNode;
}) {
  const [player, setPlayer] = useState<PlayerState>(initial ?? ANONYMOUS);
  // Ready immediately when the server told us: there is nothing to wait for.
  const [ready, setReady] = useState(!!initial);
  /*
   * Where a just-claimed reward is spent, if one is still unspent.
   *
   * Read from a store outside React (see `spend-hint.ts`) rather than held
   * here: this provider is mounted per page, and the hint's whole job is to
   * survive the walk from the dialog that handed the reward over to the screen
   * it is spent on. `getServerSnapshot` is null because there is no session
   * storage on the server — so the markup and the first paint agree, and the
   * glow appears a beat later on the client.
   */
  const spendHint = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

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
   *
   * A claim that lands now pays both sides their lives on the spot, so a
   * successful one is followed by a re-read: the header would otherwise show
   * the pool from a second ago and stay wrong until something else touched it.
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
      let claimed = false;
      try {
        const res = await fetch("/api/player/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: pending }),
        });
        const body = (await res.json().catch(() => ({}))) as { claimed?: boolean };
        claimed = body.claimed === true;
      } catch {
        // Leave the key in place; the next page load tries again.
        return;
      }
      if (cancelled) return;
      window.localStorage.removeItem(REF_KEY);
      if (claimed) await refresh();
    }
    void claim();
    return () => {
      cancelled = true;
    };
  }, [player.email, refresh]);

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

  /*
   * Re-register the push subscription this browser already holds, once a visit.
   *
   * Neither end can be trusted to stay correct on its own: a push service may
   * rotate an endpoint without telling the browser's own records, and a failed
   * send prunes our row without telling the browser at all. The browser is the
   * one that knows the truth, so it says so on every visit — and because the
   * write is an upsert on the endpoint, saying so changes nothing almost every
   * time. This does nothing at all for anyone who has not opted in.
   */
  useEffect(() => {
    void refreshPush();
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      player,
      ready,
      verified: !!player.email,
      refresh,
      adopt: setPlayer,
      spendHint,
      // Module functions, not state: they never change identity, so they are
      // not dependencies of anything.
      guideTo,
      arrivedAt,
    }),
    [player, ready, refresh, spendHint]
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/*
       * The daily streak, mounted here rather than on a page.
       *
       * "First visit of the day" is not a route: somebody who arrives on a
       * shared box link should get their day the same as somebody opening the
       * lobby. It draws nothing at all for a stranger, or on a day already
       * claimed.
       */}
      <StreakGate />
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside a PlayerProvider");
  return value;
}
