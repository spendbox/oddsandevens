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
  /** Which side of the cut this piece is — whole fruit have none. */
  half?: "left" | "right";
}

/** A short-lived splash of juice, or the flash of a bomb going off. */
interface Burst {
  id: number;
  x: number;
  y: number;
  kind: "juice" | "boom";
  colour: string;
  born: number;
}

/** Juice colours, so a sliced melon doesn't spray orange. */
const JUICE: Record<string, string> = {
  "🍉": "#fb7185",
  "🍊": "#fb923c",
  "🍏": "#a3e635",
  "🍎": "#f87171",
  "🍍": "#fbbf24",
  "🍋": "#facc15",
  "🍇": "#c084fc",
  "🍓": "#fb7185",
  "🥝": "#84cc16",
  "🍑": "#fdba74",
  "🥭": "#fb923c",
  "🫐": "#818cf8",
};
const DEFAULT_JUICE = "#f472b6";
/** How long a burst stays on screen, in seconds. */
const BURST_LIFE = 0.55;

const GRAVITY = 120; // units/s²
const SIZE = 11; // fruit diameter in units
/** Slice radius: a little wider than the fruit, so a near miss still counts. */
const BLADE = 7.5;
/** How many pointer samples the blade trail remembers. */
const TRAIL = 10;
/** …and for how long. A blade leaves a streak, not a diagram of the swipe. */
const TRAIL_LIFE = 0.22;

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
  const [trail, setTrail] = useState<{ x: number; y: number; born: number }[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [shake, setShake] = useState(false);

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
  const points = useRef<{ x: number; y: number; born: number }[]>([]);
  const swipeHits = useRef(0);
  const burstList = useRef<Burst[]>([]);
  const clock = useRef(0);
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
      clock.current += dt;

      // The streak behind the blade decays; without this a slow drag paints a
      // permanent line across the screen.
      if (points.current.length > 0) {
        const fresh = points.current.filter(
          (t) => clock.current - t.born < TRAIL_LIFE
        );
        if (fresh.length !== points.current.length) {
          points.current = fresh;
          setTrail(fresh);
        }
      }

      // Bursts fade on their own clock, in world time like everything else.
      if (burstList.current.length > 0) {
        const alive = burstList.current.filter(
          (b) => clock.current - b.born < BURST_LIFE
        );
        if (alive.length !== burstList.current.length) {
          burstList.current = alive;
          setBursts(alive);
        }
      }

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
    points.current = [
      ...points.current,
      { ...to, born: clock.current },
    ].slice(-TRAIL);
    setTrail(points.current);

    // The angle of the cut decides which way the halves fly.
    const cut = Math.atan2(to.y - from.y, to.x - from.x);
    const apartX = Math.sin(cut) * 26;
    const apartY = -Math.cos(cut) * 26;

    let hits = 0;
    let hitBomb = false;
    const next: Tossed[] = [];
    const newBursts: Burst[] = [];

    for (const obj of objects.current) {
      const missed =
        obj.sliced ||
        distanceToSegment(obj.x, obj.y, from.x, from.y, to.x, to.y) > BLADE;
      if (missed) {
        next.push(obj);
        continue;
      }

      if (obj.bomb) {
        hitBomb = true;
        newBursts.push({
          id: nextId.current++,
          x: obj.x,
          y: obj.y,
          kind: "boom",
          colour: "#f97316",
          born: clock.current,
        });
        // The bomb is gone — it went off. Nothing to animate falling.
        continue;
      }

      hits += 1;
      // The fruit becomes two halves: same flight, pushed apart along the
      // perpendicular of the cut, each spinning away from the blade.
      const juice = JUICE[obj.emoji] ?? DEFAULT_JUICE;
      newBursts.push({
        id: nextId.current++,
        x: obj.x,
        y: obj.y,
        kind: "juice",
        colour: juice,
        born: clock.current,
      });
      for (const half of ["left", "right"] as const) {
        const away = half === "left" ? 1 : -1;
        next.push({
          ...obj,
          id: nextId.current++,
          sliced: true,
          half,
          vx: obj.vx + apartX * away,
          vy: Math.min(obj.vy, -12) + apartY * away,
          spin: 140 * away,
        });
      }
    }

    objects.current = next;
    setFrame(next);
    if (newBursts.length > 0) {
      burstList.current = [...burstList.current, ...newBursts];
      setBursts(burstList.current);
    }

    if (hitBomb) {
      livesRef.current -= 1;
      setLives(Math.max(livesRef.current, 0));
      swipeHits.current = 0;
      setCombo(0);
      setShake(true);
      window.setTimeout(() => setShake(false), 420);
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
    burstList.current = [];
    clock.current = 0;
    setFrame([]);
    setTrail([]);
    setBursts([]);
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
        ratio="2 / 3"
        className={
          "bg-gradient-to-b from-slate-900 via-slate-800 to-slate-700 " +
          (shake ? "animate-shake" : "")
        }
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
              transform: `translate(-50%, -50%) rotate(${obj.angle}deg)`,
              // A halved fruit is the same glyph shown through half a window,
              // which is what makes the two pieces look like one thing cut in
              // two rather than two smaller fruit.
              clipPath: obj.half
                ? obj.half === "left"
                  ? "inset(0 50% 0 0)"
                  : "inset(0 0 0 50%)"
                : undefined,
            }}
          >
            {obj.emoji}
          </span>
        ))}

        {/* Juice where a fruit was cut, and the flash where a bomb was. */}
        {bursts.map((burst) => (
          <span
            key={burst.id}
            className="pointer-events-none absolute"
            style={{
              left: world.left(burst.x),
              top: `${burst.y}%`,
              width: size(burst.kind === "boom" ? 34 : 20),
              height: size(burst.kind === "boom" ? 34 : 20),
              transform: "translate(-50%, -50%)",
            }}
          >
            {burst.kind === "boom" ? (
              <span className="animate-blast emoji-piece flex size-full items-center justify-center text-[3em] leading-none">
                💥
              </span>
            ) : (
              <span
                className="animate-splash block size-full rounded-full"
                style={{
                  background: `radial-gradient(circle, ${burst.colour} 0%, ${burst.colour}00 70%)`,
                }}
              />
            )}
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
            {trail.slice(1).map((point, i) => {
              const previous = trail[i];
              // Older segments are thinner and fainter — a tapered streak.
              const age = (i + 1) / trail.length;
              return (
                <line
                  key={`${point.born}-${i}`}
                  x1={previous.x}
                  y1={previous.y}
                  x2={point.x}
                  y2={point.y}
                  stroke={`rgba(255,255,255,${0.15 + age * 0.75})`}
                  strokeWidth={0.6 + age * 1.8}
                  strokeLinecap="round"
                />
              );
            })}
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
