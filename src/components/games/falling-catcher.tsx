"use client";

// Catch the good stuff, dodge the rest. The basket tracks the pointer, so it
// works with a thumb, a mouse, or the arrow keys.

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
  useOnce,
  useRaf,
  type GameProps,
} from "./kit";
import { difficultyScale, emojiList } from "@/lib/games/catalog";

interface Falling {
  id: number;
  x: number;
  y: number;
  speed: number;
  emoji: string;
  bad: boolean;
}

const CATCH_Y = 84;

export default function FallingCatcher({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const [phase, setPhase] = useState<"idle" | "running" | "grading">("idle");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  // Physics lives in refs; this is the once-a-frame snapshot React renders.
  const [frame, setFrame] = useState<{ basketX: number; items: Falling[] }>({
    basketX: 50,
    items: [],
  });

  const basketX = useRef(50);
  const items = useRef<Falling[]>([]);
  const nextId = useRef(0);
  const nextSpawn = useRef(0.8);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const once = useOnce();

  const duration = clamp(Math.round(cfgNum(config, "duration", 45)), 15, 180);
  const difficulty = difficultyScale(config);
  const good = emojiList(cfgStr(config, "goodEmojis", "🍕 🍔 🥤"), ["🍕"]);
  const bad = emojiList(cfgStr(config, "badEmojis", "💣"), ["💣"]);
  const basket = cfgStr(config, "catcherEmoji", "🧺");

  const end = useCallback(() => {
    once(() => {
      setPhase("grading");
      void submit(Math.max(scoreRef.current, 0)).then((outcome) => {
        if (outcome) showResult();
      });
    });
  }, [once, submit, showResult]);

  const timeLeft = useCountdown(duration, phase === "running", end);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft") basketX.current = clamp(basketX.current - 7, 4, 96);
      if (e.code === "ArrowRight") basketX.current = clamp(basketX.current + 7, 4, 96);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const trackPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    basketX.current = clamp(((e.clientX - rect.left) / rect.width) * 100, 4, 96);
  };

  useRaf(
    (dt) => {
      nextSpawn.current -= dt;
      if (nextSpawn.current <= 0) {
        const isBad = Math.random() < 0.22;
        items.current.push({
          id: nextId.current++,
          x: 6 + Math.random() * 88,
          y: -8,
          speed: (26 + Math.random() * 16) * difficulty,
          emoji: isBad ? pick(bad) : pick(good),
          bad: isBad,
        });
        nextSpawn.current = (0.75 + Math.random() * 0.5) / difficulty;
      }

      const moved = items.current.map((item) => ({
        ...item,
        y: item.y + item.speed * dt,
      }));

      const survivors: Falling[] = [];
      for (const item of moved) {
        const caught =
          item.y >= CATCH_Y - 5 &&
          item.y <= CATCH_Y + 8 &&
          Math.abs(item.x - basketX.current) < 9;
        if (caught) {
          if (item.bad) {
            livesRef.current -= 1;
            setLives(livesRef.current);
            if (livesRef.current <= 0) {
              end();
              return;
            }
          } else {
            scoreRef.current += 1;
            setScore(scoreRef.current);
          }
          continue;
        }
        if (item.y < 112) survivors.push(item);
      }
      items.current = survivors;
      setFrame({ basketX: basketX.current, items: survivors });
    },
    phase === "running"
  );

  const start = () => {
    items.current = [];
    scoreRef.current = 0;
    livesRef.current = 3;
    nextSpawn.current = 0.8;
    basketX.current = 50;
    setScore(0);
    setLives(3);
    setFrame({ basketX: 50, items: [] });
    setPhase("running");
  };

  return (
    <div className="w-full">
      <Hud
        items={[
          { label: "Caught", value: score },
          { label: "Time", value: `${timeLeft}s` },
          { label: "Lives", value: "❤️".repeat(Math.max(lives, 0)) || "—" },
        ]}
      />
      <Stage
        ratio="3 / 4"
        className="bg-gradient-to-b from-indigo-50 to-white"
        onPointerDown={trackPointer}
      >
        <div
          className="absolute inset-0"
          onPointerMove={(e) => phase === "running" && trackPointer(e)}
        />

        {frame.items.map((item) => (
          <span
            key={item.id}
            className="absolute -translate-x-1/2"
            style={{
              left: `${item.x}%`,
              top: `${item.y}%`,
              fontSize: "clamp(20px, 7vw, 34px)",
              lineHeight: 1,
            }}
          >
            {item.emoji}
          </span>
        ))}

        <span
          className="absolute -translate-x-1/2"
          style={{
            left: `${frame.basketX}%`,
            top: `${CATCH_Y}%`,
            fontSize: "clamp(28px, 10vw, 48px)",
            lineHeight: 1,
          }}
        >
          {basket}
        </span>

        {phase === "idle" && (
          <StartOverlay
            title="Catch what falls"
            hint={`Slide to move the basket. Catch the good stuff, dodge ${bad.join(
              " "
            )} — three of those and you're out.`}
            buttonLabel="Start catching"
            accent={accent}
            onStart={start}
          />
        )}
        {phase === "grading" && <GradingOverlay />}
      </Stage>
      <p className="mt-2 text-center text-sm text-zinc-500">
        Drag anywhere to move.
      </p>
    </div>
  );
}
