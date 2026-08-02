"use client";

// Swipe through what gets tossed up. Bombs cost a life, so it stays tense even
// when the clock is generous.
//
// Two things that a hit-test-per-frame version gets wrong and this doesn't.
// Tosses are real parabolas: launched with a velocity aimed at a point in the
// air, so they arc up, hang, and fall back the way a thrown thing does, rather
// than rising at a fixed rate. And a swipe is tested as the *segment* between
// the last pointer position and this one — a fast flick used to skip straight
// over a fruit between two samples, which is exactly the swipe a player thinks
// should have worked.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GradingOverlay,
  Hud,
  Stage,
  StartOverlay,
  cfgNum,
  cfgStr,
  clamp,
  pick,
  useCountdown,
  useFixedStep,
  useOnce,
  useWorld,
  type GameProps,
} from "./kit";
import { difficultyScale, emojiList } from "@/lib/games/catalog";

interface Tossed {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  emoji: string;
  bomb: boolean;
  sliced: boolean;
}

const GRAVITY = 120; // units/s²
const SIZE = 11; // fruit diameter in units
/** Slice radius: a little wider than the fruit, so a near miss still counts. */
const BLADE = 7.5;
/** How many pointer samples the blade trail remembers. */
const TRAIL = 8;

export default function SliceNinja({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const [phase, setPhase] = useState<"idle" | "running" | "grading">("idle");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  // Physics in refs; this snapshot is what React renders each frame.
  const [frame, setFrame] = useState<Tossed[]>([]);
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);

  const world = useWorld<HTMLDivElement>();
  // The physics loop needs the live width without re-subscribing every resize,
  // and a ref may not be written during render — so an effect keeps it in step.
  const widthRef = useRef(100);
  useEffect(() => {
    widthRef.current = world.unitsWide;
  }, [world.unitsWide]);

  const objects = useRef<Tossed[]>([]);
  const nextId = useRef(0);
  const nextToss = useRef(0.6);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const slicing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const points = useRef<{ x: number; y: number }[]>([]);
  const swipeHits = useRef(0);
  const once = useOnce();

  const startingLives = clamp(Math.round(cfgNum(config, "lives", 3)), 1, 9);
  const duration = clamp(Math.round(cfgNum(config, "duration", 45)), 15, 180);
  const difficulty = difficultyScale(config);
  const fruit = emojiList(cfgStr(config, "sliceEmojis", "🍉 🍊 🍏 🍍"), ["🍉"]);
  const bomb = cfgStr(config, "bombEmoji", "💣");

  const end = useCallback(() => {
    once(() => {
      setPhase("grading");
      void submit(Math.max(scoreRef.current, 0)).then((outcome) => {
        if (outcome) showResult();
      });
    });
  }, [once, submit, showResult]);

  const timeLeft = useCountdown(duration, phase === "running", end);

  useFixedStep(
    (dt) => {
      const width = widthRef.current;

      // --- Toss: aimed so the arc peaks in view ---------------------------
      nextToss.current -= dt;
      if (nextToss.current <= 0) {
        const isBomb = Math.random() < 0.16;
        const from = width * (0.15 + Math.random() * 0.7);
        // Peak 62–86 units above the launch line.
        const rise = 62 + Math.random() * 24;
        const vy = -Math.sqrt(2 * GRAVITY * rise);
        const airtime = (2 * Math.abs(vy)) / GRAVITY;
        // Drift toward the middle so nothing exits sideways immediately.
        const target = width * (0.25 + Math.random() * 0.5);
        objects.current = [
          ...objects.current,
          {
            id: nextId.current++,
            x: from,
            y: 108,
            vx: (target - from) / airtime,
            vy,
            spin: (Math.random() - 0.5) * 260,
            angle: 0,
            emoji: isBomb ? bomb : pick(fruit),
            bomb: isBomb,
            sliced: false,
          },
        ];
        nextToss.current = (0.65 + Math.random() * 0.5) / difficulty;
      }

      objects.current = objects.current
        .map((obj) => ({
          ...obj,
          vy: obj.vy + GRAVITY * dt,
          x: obj.x + obj.vx * dt,
          y: obj.y + (obj.vy + GRAVITY * dt) * dt,
          angle: obj.angle + obj.spin * dt,
        }))
        .filter((o) => o.y < 125);
      setFrame(objects.current);
    },
    phase === "running"
  );

  /** Distance from a point to the segment a->b, in world units. */
  const distanceToSegment = (
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number
  ) => {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq === 0
        ? 0
        : clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };

  const pointerUnits = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * widthRef.current,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  };

  /** Everything the blade crossed between the last sample and this one. */
  const sliceAlong = (to: { x: number; y: number }) => {
    const from = last.current ?? to;
    last.current = to;
    points.current = [...points.current, to].slice(-TRAIL);
    setTrail(points.current);

    let hits = 0;
    let hitBomb = false;
    const next = objects.current.map((obj) => {
      if (obj.sliced) return obj;
      const d = distanceToSegment(obj.x, obj.y, from.x, from.y, to.x, to.y);
      if (d > BLADE) return obj;
      if (obj.bomb) {
        hitBomb = true;
        return { ...obj, sliced: true };
      }
      hits += 1;
      // A sliced piece is flicked up and spun before it drops out of the stage.
      return {
        ...obj,
        sliced: true,
        vy: Math.min(obj.vy, -18),
        spin: obj.spin * 2.5,
      };
    });

    objects.current = next;
    setFrame(next);

    if (hitBomb) {
      livesRef.current -= 1;
      setLives(Math.max(livesRef.current, 0));
      swipeHits.current = 0;
      setCombo(0);
      if (livesRef.current <= 0) {
        end();
        return;
      }
    }
    if (hits > 0) {
      // One swipe through several fruit is worth more than several swipes.
      swipeHits.current += hits;
      const bonus = swipeHits.current >= 3 ? swipeHits.current - 2 : 0;
      scoreRef.current += hits + bonus;
      setScore(scoreRef.current);
      setCombo(swipeHits.current);
    }
  };

  const start = () => {
    objects.current = [];
    scoreRef.current = 0;
    livesRef.current = startingLives;
    nextToss.current = 0.5;
    last.current = null;
    points.current = [];
    swipeHits.current = 0;
    setScore(0);
    setCombo(0);
    setLives(startingLives);
    setFrame([]);
    setTrail([]);
    setPhase("running");
  };

  const endSwipe = () => {
    slicing.current = false;
    last.current = null;
    points.current = [];
    swipeHits.current = 0;
    setTrail([]);
    setCombo(0);
  };

  const size = (units: number) => `${units * world.pxPerUnit}px`;

  return (
    <div className="flex w-full flex-col">
      <Hud
        items={[
          { label: "Sliced", value: score, icon: "🔪" },
          { label: "Time left", value: `${timeLeft}s`, icon: "⏱️" },
          {
            label: "Lives",
            value: "❤️".repeat(Math.max(lives, 0)) || "—",
            icon: "",
          },
        ]}
      />
      <Stage
        ratio="3 / 4"
        className="bg-gradient-to-b from-slate-900 via-slate-800 to-slate-700"
        onPointerDown={(e) => {
          if (phase !== "running") return;
          slicing.current = true;
          last.current = null;
          sliceAlong(pointerUnits(e));
        }}
        innerRef={world.ref}
      >
        <div
          className="absolute inset-0"
          onPointerMove={(e) => {
            if (phase !== "running" || !slicing.current) return;
            sliceAlong(pointerUnits(e));
          }}
          onPointerUp={endSwipe}
          onPointerLeave={endSwipe}
        />

        {frame.map((obj) => (
          <span
            key={obj.id}
            className="emoji-piece absolute"
            style={{
              left: world.left(obj.x),
              top: `${obj.y}%`,
              fontSize: size(SIZE),
              opacity: obj.sliced ? 0.3 : 1,
              transform: `translate(-50%, -50%) rotate(${obj.angle}deg)`,
            }}
          >
            {obj.emoji}
          </span>
        ))}

        {/* The blade trail — the only feedback that a swipe was registered. */}
        {trail.length > 1 && (
          <svg
            className="pointer-events-none absolute inset-0 size-full"
            viewBox={`0 0 ${world.unitsWide} 100`}
            preserveAspectRatio="none"
            aria-hidden
          >
            <polyline
              points={trail.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}

        {combo >= 3 && (
          <span className="animate-pop absolute inset-x-0 top-[12%] text-center text-2xl font-extrabold text-white drop-shadow">
            {combo}× COMBO
          </span>
        )}

        {phase === "idle" && (
          <StartOverlay
            title="Slice everything"
            hint={`Swipe to slice. Every ${bomb} costs a life.`}
            buttonLabel="Start slicing"
            accent={accent}
            onStart={start}
          />
        )}
        {phase === "grading" && <GradingOverlay />}
      </Stage>
    </div>
  );
}
