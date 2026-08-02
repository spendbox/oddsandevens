"use client";

// Swipe through what gets tossed up. Bombs end the round, so it stays tense
// even when the clock is generous.

import { useCallback, useRef, useState } from "react";
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
  useOnce,
  useRaf,
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
  emoji: string;
  bomb: boolean;
  sliced: boolean;
}

const GRAVITY = 105;

export default function SliceNinja({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const [phase, setPhase] = useState<"idle" | "running" | "grading">("idle");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  // Physics in refs; this snapshot is what React renders each frame.
  const [frame, setFrame] = useState<Tossed[]>([]);

  const objects = useRef<Tossed[]>([]);
  const nextId = useRef(0);
  const nextToss = useRef(0.6);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const slicing = useRef(false);
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

  useRaf(
    (dt) => {
      nextToss.current -= dt;
      const tossed = [...objects.current];
      if (nextToss.current <= 0) {
        const isBomb = Math.random() < 0.16;
        const fromLeft = Math.random() < 0.5;
        tossed.push({
          id: nextId.current++,
          x: fromLeft ? 10 + Math.random() * 20 : 70 + Math.random() * 20,
          y: 104,
          vx: (fromLeft ? 1 : -1) * (8 + Math.random() * 14),
          vy: -(72 + Math.random() * 18) * Math.sqrt(difficulty),
          spin: (Math.random() - 0.5) * 400,
          emoji: isBomb ? bomb : pick(fruit),
          bomb: isBomb,
          sliced: false,
        });
        nextToss.current = (0.7 + Math.random() * 0.5) / difficulty;
      }

      objects.current = tossed
        .map((obj) => {
          const vy = obj.vy + GRAVITY * dt;
          return { ...obj, vy, x: obj.x + obj.vx * dt, y: obj.y + vy * dt };
        })
        .filter((o) => o.y < 125);
      setFrame(objects.current);
    },
    phase === "running"
  );

  // A swipe is a pointer move with the button down; anything it passes over
  // gets sliced.
  const sliceAt = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== "running" || !slicing.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;

    let hits = 0;
    let hitBomb = false;
    const next = objects.current.map((obj) => {
      if (obj.sliced) return obj;
      if (Math.hypot(obj.x - px, obj.y - py) > 9) return obj;
      if (obj.bomb) {
        hitBomb = true;
        return { ...obj, sliced: true };
      }
      hits += 1;
      // A sliced piece gets flicked upward before it falls out of the stage.
      return { ...obj, sliced: true, vy: Math.min(obj.vy, -10) };
    });

    objects.current = next;
    setFrame(next);
    if (hitBomb) {
      livesRef.current -= 1;
      setLives(livesRef.current);
      if (livesRef.current <= 0) {
        end();
        return;
      }
    }
    if (hits > 0) {
      scoreRef.current += hits;
      setScore(scoreRef.current);
    }
  };

  const start = () => {
    objects.current = [];
    scoreRef.current = 0;
    livesRef.current = startingLives;
    nextToss.current = 0.6;
    setScore(0);
    setLives(startingLives);
    setFrame([]);
    setPhase("running");
  };

  return (
    <div className="w-full">
      <Hud
        items={[
          { label: "Sliced", value: score, icon: "🔪" },
          { label: "Time left", value: `${timeLeft}s`, icon: "⏱️" },
          { label: "Lives", value: "❤️".repeat(Math.max(lives, 0)) || "—", icon: "" },
        ]}
      />
      <Stage
        ratio="3 / 4"
        className="bg-gradient-to-b from-zinc-900 to-zinc-700"
        onPointerDown={(e) => {
          slicing.current = true;
          sliceAt(e);
        }}
      >
        <div
          className="absolute inset-0"
          onPointerMove={sliceAt}
          onPointerUp={() => {
            slicing.current = false;
          }}
          onPointerLeave={() => {
            slicing.current = false;
          }}
        />
        {frame.map((obj) => (
          <span
            key={obj.id}
            className="emoji-piece absolute -translate-x-1/2 -translate-y-1/2 transition-opacity"
            style={{
              left: `${obj.x}%`,
              top: `${obj.y}%`,
              fontSize: "clamp(26px, 9vw, 44px)",
              lineHeight: 1,
              opacity: obj.sliced ? 0.25 : 1,
              transform: `translate(-50%, -50%) rotate(${obj.spin * obj.y * 0.01}deg)`,
            }}
          >
            {obj.emoji}
          </span>
        ))}

        {phase === "idle" && (
          <StartOverlay
            title="Slice everything"
            hint={`Swipe across the screen to slice. Every ${bomb} costs one of your ${startingLives} ${
              startingLives === 1 ? "life" : "lives"
            }.`}
            buttonLabel="Start slicing"
            accent={accent}
            onStart={start}
          />
        )}
        {phase === "grading" && <GradingOverlay />}
      </Stage>
      <p className="mt-2 text-center text-sm text-zinc-500">
        Drag across the screen to slice.
      </p>
    </div>
  );
}
