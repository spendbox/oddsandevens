"use client";

// Where an unspent reward is waiting, between claiming it and finding it.
//
// A module-level store rather than React state, because the thing this has to
// survive is a navigation. `PlayerProvider` is mounted per page — the lobby, a
// safe and the safehouse each mount their own — so a hint held in a provider
// is lost by exactly the journey it exists to guide: "open any safe and take
// it from the shelf" is a different page by definition. The value is mirrored
// into `sessionStorage` so it also survives a full reload, and read back
// through `useSyncExternalStore` so that every badge and tab on screen agrees
// about it without any of them owning it.

import type { SpendTarget } from "@/lib/game/streaks";

const KEY = "spendbox.spend-hint";

/**
 * How long a control keeps glowing.
 *
 * Long enough to survive picking a safe and reading its card; short enough
 * that a badge is not still pulsing at somebody an hour later, by which point
 * it has stopped meaning "something is waiting" and started meaning nothing.
 * The reward itself outlives the glow — a life discount runs for a day — so
 * this expiring costs nobody the reward.
 */
const MINUTES = 30;

export interface SpendHint {
  target: SpendTarget;
  /** Said in one line, for the surfaces that show it in words. */
  where: string;
  /** Epoch ms. Past this the glow stops on its own. */
  until: number;
}

let cache: SpendHint | null = null;
let loaded = false;
let timer: number | null = null;
const listeners = new Set<() => void>();

/** What is stored, if it hasn't run out. Bad or stale JSON reads as nothing. */
function fromStorage(): SpendHint | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const hint = JSON.parse(raw) as SpendHint;
    return hint?.target && hint.until > Date.now() ? hint : null;
  } catch {
    // No storage, or something else's key under this name. Either way: none.
    return null;
  }
}

function write(hint: SpendHint | null) {
  try {
    if (hint) window.sessionStorage.setItem(KEY, JSON.stringify(hint));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // A browser refusing storage still gets the glow on the page it was won
    // on; it just won't follow them to the next one.
  }
}

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Stop glowing when the window closes, without anybody having to re-render.
 *
 * Somebody who claims a discount and then sits on one screen would otherwise
 * keep a pulsing badge in the corner indefinitely, because nothing else would
 * come along to notice the time.
 */
function arm() {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  if (!cache) return;
  timer = window.setTimeout(() => {
    cache = null;
    write(null);
    emit();
  }, Math.max(0, cache.until - Date.now()));
}

function load() {
  if (loaded) return;
  loaded = true;
  cache = fromStorage();
}

export function subscribe(listener: () => void): () => void {
  load();
  // Armed on the first subscriber rather than on load: a hint restored from
  // storage on a fresh page has a deadline nothing else is watching.
  if (timer === null) arm();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): SpendHint | null {
  load();
  // Expiry is checked here as well as by the timer: a tab restored from the
  // back/forward cache can wake with its timers long since fired.
  return cache && cache.until > Date.now() ? cache : null;
}

/** There is no session storage on the server, so there is never a hint. */
export function getServerSnapshot(): SpendHint | null {
  return null;
}

/** Point at a till. Called by the streak dialog as it closes. */
export function guideTo(target: SpendTarget, where: string) {
  load();
  cache = { target, where, until: Date.now() + MINUTES * 60_000 };
  write(cache);
  arm();
  emit();
}

/** They arrived. Clears the hint if it was pointing here, and nothing if not. */
export function arrivedAt(target: SpendTarget) {
  load();
  if (cache?.target !== target) return;
  cache = null;
  write(null);
  arm();
  emit();
}
