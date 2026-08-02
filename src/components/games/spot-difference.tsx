"use client";

// Spot the difference. With two images it uses the differences the merchant
// marked; with none it generates an emoji grid puzzle so the game still works
// out of the box.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GradingOverlay,
  Hud,
  cfgList,
  cfgNum,
  cfgStr,
  clamp,
  useCountdown,
  useOnce,
  type GameProps,
} from "./kit";

interface Spot {
  x: number;
  y: number;
  r: number;
}

const FALLBACK_FACES = ["🍎", "🍊", "🍋", "🍇", "🍓", "🥝", "🍑", "🍒"];
const FALLBACK_COLS = 6;
const FALLBACK_ROWS = 8;
const FALLBACK_DIFFS = 5;

/** Every find is worth this, plus the seconds still on the clock. */
const FIND_BASE = 100;
const FIND_SPEED = 8;
/** Clearing the board pays out the rest of the clock again. */
const CLEAR_BONUS = 20;
/** A wrong tap. Looking has to cost something or tapping everywhere wins. */
const MISS_PENALTY = 40;

export default function SpotDifference({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const imageA = cfgStr(config, "imageA", "");
  const imageB = cfgStr(config, "imageB", "");
  const timeLimit = clamp(Math.round(cfgNum(config, "timeLimit", 120)), 30, 600);
  const imageMode = Boolean(imageA && imageB);

  const spots = useMemo<Spot[]>(() => {
    const raw = cfgList<Partial<Spot>>(config, "spots", []);
    return raw
      .map((s) => ({
        x: clamp(Number(s.x ?? 50), 0, 100),
        y: clamp(Number(s.y ?? 50), 0, 100),
        r: clamp(Number(s.r ?? 9), 3, 25),
      }))
      .filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));
  }, [config]);

  // Emoji fallback: two grids that differ in a handful of cells. Built once,
  // on mount, so the random draw never happens during a render.
  const [fallback] = useState(() => {
    const cells = Array.from(
      { length: FALLBACK_COLS * FALLBACK_ROWS },
      () => FALLBACK_FACES[Math.floor(Math.random() * FALLBACK_FACES.length)]
    );
    const changed = new Set<number>();
    while (changed.size < FALLBACK_DIFFS) {
      changed.add(Math.floor(Math.random() * cells.length));
    }
    const second = [...cells];
    for (const index of changed) {
      const others = FALLBACK_FACES.filter((f) => f !== cells[index]);
      second[index] = others[Math.floor(Math.random() * others.length)];
    }
    return { first: cells, second, changed: [...changed] };
  });

  const totalToFind = imageMode ? spots.length : FALLBACK_DIFFS;
  const [found, setFound] = useState<number[]>([]);
  const [misses, setMisses] = useState(0);
  const [grading, setGrading] = useState(false);
  const [running, setRunning] = useState(true);
  const foundRef = useRef<number[]>([]);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [float, setFloat] = useState<{ points: number; nth: number } | null>(null);
  // The countdown's own value, readable from an event handler.
  const secondsLeft = useRef(0);
  const once = useOnce();

  const finish = useCallback(() => {
    once(() => {
      setRunning(false);
      setGrading(true);
      // Finding them all with time to spare is worth far more than finding
      // them all as the clock dies — otherwise every good player ties on
      // "found 5 of 5" and the board is decided by who played first.
      const cleared = foundRef.current.length >= totalToFind;
      const total = Math.max(
        scoreRef.current + (cleared ? secondsLeft.current * CLEAR_BONUS : 0),
        0
      );
      void submit(total, {
        found: foundRef.current.length,
        of: totalToFind,
        cleared,
      }).then((outcome) => {
        if (outcome) showResult();
      });
    });
  }, [once, submit, showResult, totalToFind]);

  const timeLeft = useCountdown(timeLimit, running, finish);
  useEffect(() => {
    secondsLeft.current = timeLeft;
  }, [timeLeft]);

  const register = (index: number) => {
    if (grading || found.includes(index)) return;
    const next = [...found, index];
    foundRef.current = next;
    setFound(next);

    // Each find is worth a base plus whatever is left on the clock.
    const points = FIND_BASE + secondsLeft.current * FIND_SPEED;
    scoreRef.current += points;
    setScore(scoreRef.current);
    setFloat({ points, nth: next.length });

    if (next.length >= totalToFind) window.setTimeout(finish, 600);
  };

  const clickImage = (e: React.MouseEvent<HTMLDivElement>) => {
    if (grading) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const hit = spots.findIndex(
      (spot) => Math.hypot(spot.x - x, spot.y - y) <= spot.r
    );
    if (hit >= 0) register(hit);
    else {
      setMisses((m) => m + 1);
      scoreRef.current = Math.max(scoreRef.current - MISS_PENALTY, 0);
      setScore(scoreRef.current);
    }
  };

  const markers = (
    <>
      {found.map((index) => {
        const spot = spots[index];
        if (!spot) return null;
        return (
          <span
            key={index}
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4"
            style={{
              left: `${spot.x}%`,
              top: `${spot.y}%`,
              width: `${spot.r * 2}%`,
              aspectRatio: "1 / 1",
              borderColor: accent,
            }}
          />
        );
      })}
    </>
  );

  return (
    <div className="w-full">
      <Hud
        items={[
          { label: "Score", value: score, icon: "⚡" },
          { label: "Found", value: `${found.length}/${totalToFind}`, icon: "🔍" },
          { label: "Time left", value: `${timeLeft}s`, icon: "⏱️" },
          { label: "Misses", value: misses, icon: "❌" },
        ]}
      />

      {/* What the last find was worth — the clock bonus is the whole point,
          so it has to be visible while it is being earned. */}
      {float && (
        <p
          key={float.nth}
          className="animate-pop -mt-1 mb-1 text-center text-sm font-extrabold text-emerald-600"
        >
          +{float.points}
        </p>
      )}

      <div className="relative">
        {imageMode ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {[imageA, imageB].map((src, i) => (
              <div
                key={i}
                onClick={clickImage}
                className="relative cursor-crosshair overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100"
                style={{ aspectRatio: "1 / 1" }}
              >
                {/* Plain img: these are merchant-supplied absolute URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={i === 0 ? "Original" : "Edited"}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
                {markers}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {[fallback.first, fallback.second].map((cells, gridIndex) => (
              <div
                key={gridIndex}
                className="grid gap-0.5 rounded-2xl border border-zinc-200 bg-white p-2"
                style={{
                  gridTemplateColumns: `repeat(${FALLBACK_COLS}, minmax(0, 1fr))`,
                }}
              >
                {cells.map((face, index) => {
                  const diffIndex = fallback.changed.indexOf(index);
                  const isFound = diffIndex >= 0 && found.includes(diffIndex);
                  return (
                    <button
                      key={index}
                      onClick={() => {
                        if (grading) return;
                        if (diffIndex >= 0) register(diffIndex);
                        else {
                          setMisses((m) => m + 1);
                          scoreRef.current = Math.max(
                            scoreRef.current - MISS_PENALTY,
                            0
                          );
                          setScore(scoreRef.current);
                        }
                      }}
                      className="emoji-piece flex aspect-square items-center justify-center rounded-md transition"
                      style={{
                        fontSize: "clamp(11px, 3.2vw, 20px)",
                        lineHeight: 1,
                        outline: isFound ? `2px solid ${accent}` : "none",
                        outlineOffset: "-2px",
                        background: isFound ? `${accent}22` : undefined,
                      }}
                      aria-label={`Cell ${index + 1}`}
                    >
                      {face}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
        {grading && (
          <div className="absolute inset-0 rounded-2xl">
            <GradingOverlay />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">
          {imageMode
            ? "Tap each difference you spot — on either picture."
            : "The two grids differ in five places. Tap them."}
        </p>
        <button onClick={finish} className="btn-ghost" style={{ color: accent }}>
          I&apos;m done
        </button>
      </div>
    </div>
  );
}
