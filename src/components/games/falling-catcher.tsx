"use client";

// Catch the good stuff, dodge the rest.
//
// The world is in units of stage height and integrated in fixed slices, so
// items fall at the same rate whatever the screen or the frame rate. Two
// things make it feel like a game rather than a hit test: the basket chases
// the finger at a real top speed instead of teleporting under it, so there is
// something to be good at; and a catch is tested against the path the item
// travelled during the step, not just where it happens to be at the end of
// one — a fast item can't fall straight through the basket.

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

interface Falling {
  id: number;
  x: number;
  y: number;
  speed: number;
  emoji: string;
  bad: boolean;
}

const CATCH_Y = 82; // where the rim of the basket sits, in units
const BASKET_W = 14;
const ITEM_SIZE = 9;
/** How fast the basket can move, in units per second. */
const BASKET_SPEED = 165;
const GRAVITY = 22; // items pick up speed as they fall

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

  const world = useWorld<HTMLDivElement>();
  // The physics loop needs the live width without re-subscribing every resize,
  // and a ref may not be written during render — so an effect keeps it in step.
  const widthRef = useRef(100);
  useEffect(() => {
    widthRef.current = world.unitsWide;
  }, [world.unitsWide]);

  const basketX = useRef(50);
  const targetX = useRef(50);
  const items = useRef<Falling[]>([]);
  const nextId = useRef(0);
  const nextSpawn = useRef(0.6);
  const elapsed = useRef(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const once = useOnce();

  const startingLives = clamp(Math.round(cfgNum(config, "lives", 3)), 1, 9);
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
      const half = BASKET_W / 2;
      if (e.code === "ArrowLeft") {
        targetX.current = clamp(targetX.current - 9, half, widthRef.current - half);
      }
      if (e.code === "ArrowRight") {
        targetX.current = clamp(targetX.current + 9, half, widthRef.current - half);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const trackPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const units = ((e.clientX - rect.left) / rect.width) * widthRef.current;
    targetX.current = clamp(units, BASKET_W / 2, widthRef.current - BASKET_W / 2);
  };

  useFixedStep(
    (dt) => {
      elapsed.current += dt;

      // --- The basket chases the finger, it doesn't teleport ---------------
      const delta = targetX.current - basketX.current;
      const step = BASKET_SPEED * dt;
      basketX.current += Math.abs(delta) <= step ? delta : Math.sign(delta) * step;

      // --- Spawning, quickening as the round goes on ----------------------
      nextSpawn.current -= dt;
      if (nextSpawn.current <= 0) {
        const isBad = Math.random() < 0.22;
        const margin = ITEM_SIZE;
        items.current = [
          ...items.current,
          {
            id: nextId.current++,
            x: margin + Math.random() * (widthRef.current - margin * 2),
            y: -ITEM_SIZE,
            speed: (30 + Math.random() * 16) * difficulty,
            emoji: isBad ? pick(bad) : pick(good),
            bad: isBad,
          },
        ];
        const pace = Math.max(0.34, 0.75 - elapsed.current * 0.006);
        nextSpawn.current = (pace + Math.random() * 0.35) / difficulty;
      }

      // --- Fall, then test the path each item swept through ----------------
      const survivors: Falling[] = [];
      let caught = 0;
      let hit = 0;
      for (const item of items.current) {
        const speed = item.speed + GRAVITY * elapsed.current * 0.05;
        const from = item.y;
        const to = from + speed * dt;

        // The rim is a band; an item counts as caught if its path crossed the
        // band this step while the basket was under it.
        const crossed = from <= CATCH_Y + 4 && to >= CATCH_Y - 4;
        const overlapX =
          Math.abs(item.x - basketX.current) < (BASKET_W + ITEM_SIZE) / 2.4;
        if (crossed && overlapX) {
          if (item.bad) hit += 1;
          else caught += 1;
          continue;
        }
        if (to < 108) survivors.push({ ...item, y: to, speed });
      }
      items.current = survivors;

      if (caught > 0) {
        scoreRef.current += caught;
        setScore(scoreRef.current);
      }
      if (hit > 0) {
        livesRef.current -= hit;
        setLives(Math.max(livesRef.current, 0));
        if (livesRef.current <= 0) {
          end();
          return;
        }
      }

      setFrame({ basketX: basketX.current, items: survivors });
    },
    phase === "running"
  );

  const start = () => {
    items.current = [];
    scoreRef.current = 0;
    livesRef.current = startingLives;
    nextSpawn.current = 0.6;
    elapsed.current = 0;
    basketX.current = widthRef.current / 2;
    targetX.current = widthRef.current / 2;
    setScore(0);
    setLives(startingLives);
    setFrame({ basketX: basketX.current, items: [] });
    setPhase("running");
  };

  const size = (units: number) => `${units * world.pxPerUnit}px`;

  return (
    <div className="flex w-full flex-col">
      <Hud
        items={[
          { label: "Caught", value: score, icon: "🧺" },
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
        className="bg-gradient-to-b from-sky-300 via-sky-100 to-emerald-100"
        onPointerDown={trackPointer}
        innerRef={world.ref}
      >
        <div
          className="absolute inset-0"
          onPointerMove={(e) => phase === "running" && trackPointer(e)}
        />

        {/* Ground, so the basket is standing on something. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[12%] bg-gradient-to-b from-emerald-300/70 to-emerald-500/70" />

        {frame.items.map((item) => (
          <span
            key={item.id}
            className="emoji-piece absolute -translate-x-1/2"
            style={{
              left: world.left(item.x),
              top: `${item.y}%`,
              fontSize: size(ITEM_SIZE),
            }}
          >
            {item.emoji}
          </span>
        ))}

        <span
          className="emoji-piece absolute -translate-x-1/2"
          style={{
            left: world.left(frame.basketX),
            top: `${CATCH_Y - 2}%`,
            fontSize: size(BASKET_W),
          }}
        >
          {basket}
        </span>

        {phase === "idle" && (
          <StartOverlay
            title="Catch what falls"
            hint={`Slide to move the basket. Dodge ${bad.join(" ")}.`}
            buttonLabel="Start catching"
            accent={accent}
            onStart={start}
          />
        )}
        {phase === "grading" && <GradingOverlay />}
      </Stage>
    </div>
  );
}
