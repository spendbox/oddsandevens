"use client";

// Shared building blocks for the game components: the contract every game
// implements, plus the handful of hooks and chrome they all want.
//
// A game never decides whether the player won — it plays, then calls
// `submit(score)` and animates whatever the server hands back.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GameConfig, GameOutcome, PublicPrizeSlot } from "@/lib/games/types";

export interface GameProps {
  config: GameConfig;
  prizes: PublicPrizeSlot[];
  /** Resolved brand/theme colour to paint the game with. */
  accent: string;
  /** False when the player has already hit this game's win cap. */
  canWin: boolean;
  /** Ask the server to grade the round. Resolves to null on a network error. */
  submit: (
    score: number,
    meta?: Record<string, unknown>
  ) => Promise<GameOutcome | null>;
  /** Tell the shell the reveal animation is done and it may show the result. */
  showResult: () => void;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** requestAnimationFrame loop with a delta in seconds, capped against tab stalls. */
export function useRaf(
  callback: (dt: number, elapsed: number) => void,
  active: boolean
) {
  const cbRef = useRef(callback);
  useLayoutEffect(() => {
    cbRef.current = callback;
  });

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const start = last;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      cbRef.current(dt, (now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}

/** Whole-second countdown that fires once when it reaches zero. */
export function useCountdown(seconds: number, active: boolean, onEnd: () => void) {
  const [left, setLeft] = useState(seconds);
  const endedRef = useRef(false);
  const onEndRef = useRef(onEnd);
  useLayoutEffect(() => {
    onEndRef.current = onEnd;
  });

  useEffect(() => {
    if (!active) return;
    endedRef.current = false;
    const deadline = Date.now() + seconds * 1000;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0 && !endedRef.current) {
        endedRef.current = true;
        clearInterval(id);
        onEndRef.current();
      }
    }, 200);
    return () => clearInterval(id);
  }, [seconds, active]);

  return left;
}

/** Element size, for games that need pixel coordinates. */
export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}

/** A stable "submit once" guard — arcade loops can end on the same frame twice. */
export function useOnce() {
  const done = useRef(false);
  return useCallback((fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  }, []);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), max);

export function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Reads a string off a config object with a fallback (config is untyped jsonb). */
export const cfgStr = (config: GameConfig, key: string, fallback: string) => {
  const value = config?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : fallback;
};

export const cfgNum = (config: GameConfig, key: string, fallback: number) => {
  const value = config?.[key];
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
};

export const cfgBool = (config: GameConfig, key: string, fallback: boolean) => {
  const value = config?.[key];
  return typeof value === "boolean" ? value : fallback;
};

export function cfgList<T>(config: GameConfig, key: string, fallback: T[]): T[] {
  const value = config?.[key];
  return Array.isArray(value) && value.length > 0 ? (value as T[]) : fallback;
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

/**
 * The playfield: a fixed-ratio screen set into the cabinet.
 *
 * The frame, the vignette and the HUD live here rather than in each game, so
 * twenty games share one look and a new one gets it for free.
 */
export function Stage({
  children,
  ratio = "4 / 5",
  className = "",
  onPointerDown,
  innerRef,
}: {
  children: React.ReactNode;
  ratio?: string;
  className?: string;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  innerRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={innerRef}
      onPointerDown={onPointerDown}
      style={{ aspectRatio: ratio }}
      className={
        "arcade-screen arcade-vignette relative w-full touch-none overflow-hidden select-none " +
        className
      }
    >
      {children}
    </div>
  );
}

/**
 * Score / time / lives, as pills.
 *
 * A number a player glances at twice a second shouldn't be under a caption:
 * an icon carries the meaning and the value gets the size. `icon` is an emoji
 * — ⏱ is a clock in any language.
 */
export function Hud({
  items,
}: {
  items: { label: string; value: string | number; icon?: string }[];
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
      {items.map((item) => (
        <span key={item.label} className="hud-chip" title={item.label}>
          <span className="emoji text-base leading-none" aria-hidden>
            {item.icon ?? "•"}
          </span>
          <span className="sr-only">{item.label}: </span>
          {item.value}
        </span>
      ))}
    </div>
  );
}

export function ActionButton({
  children,
  onClick,
  accent,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  accent: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ "--brand": accent } as React.CSSProperties}
      className={"btn-play " + className}
    >
      {children}
    </button>
  );
}

/**
 * Shown over the stage before a round starts: what the game is, one line of
 * how, and a button the size of a thumb. Anything longer than a line belongs
 * in the game itself, not in front of it.
 */
export function StartOverlay({
  title,
  hint,
  buttonLabel,
  accent,
  onStart,
}: {
  title: string;
  hint: string;
  buttonLabel: string;
  accent: string;
  onStart: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-zinc-950/70 p-6 text-center backdrop-blur-sm">
      <h3 className="animate-pop text-2xl font-extrabold tracking-tight text-white drop-shadow">
        {title}
      </h3>
      <p className="max-w-xs text-sm leading-snug text-zinc-300">{hint}</p>
      <button
        onClick={onStart}
        style={{ "--brand": accent } as React.CSSProperties}
        className="btn-play animate-shine mt-1 w-auto overflow-hidden px-10"
      >
        {buttonLabel}
      </button>
    </div>
  );
}

/** Shown over the stage while the server grades the round. */
export function GradingOverlay({ label = "Scoring" }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-zinc-950/70 backdrop-blur-sm">
      <span className="size-10 animate-spin rounded-full border-4 border-white/25 border-t-white" />
      <span className="text-sm font-bold uppercase tracking-widest text-white/80">
        {label}
      </span>
    </div>
  );
}
