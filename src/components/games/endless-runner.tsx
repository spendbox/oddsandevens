"use client";

// One-button endless runner. Everything lives in percent-of-stage units so the
// game plays identically on a phone and a desktop.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GradingOverlay,
  Hud,
  Stage,
  StartOverlay,
  cfgNum,
  cfgStr,
  clamp,
  useOnce,
  useRaf,
  type GameProps,
} from "./kit";
import { difficultyScale } from "@/lib/games/catalog";

const GROUND_Y = 82; // % from the top where the ground line sits
const PLAYER_X = 14;
const PLAYER_SIZE = 9;
const JUMP_VELOCITY = 88;
const GRAVITY = 230;

interface Obstacle {
  x: number;
  height: number;
}

export default function EndlessRunner({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const [phase, setPhase] = useState<"idle" | "running" | "grading">("idle");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  // The world lives in refs (mutated 60 times a second); this snapshot is what
  // React actually renders, published once per frame.
  const [frame, setFrame] = useState<{
    y: number;
    obstacles: Obstacle[];
    hurt: boolean;
  }>({ y: 0, obstacles: [], hurt: false });

  const playerY = useRef(0); // height above the ground, in %
  const velocity = useRef(0);
  const obstacles = useRef<Obstacle[]>([]);
  const distance = useRef(0);
  const nextSpawn = useRef(1.2);
  const livesRef = useRef(3);
  // Seconds of invulnerability left after a hit, so one cactus can't take
  // every life in a single stride.
  const graceRef = useRef(0);
  const once = useOnce();

  const difficulty = difficultyScale(config);
  const startingLives = clamp(Math.round(cfgNum(config, "lives", 3)), 1, 9);
  const runner = cfgStr(config, "runnerEmoji", "🏃");
  const obstacleEmoji = cfgStr(config, "obstacleEmoji", "🌵");
  const groundColor = cfgStr(config, "groundColor", "#1f2937");

  const jump = useCallback(() => {
    if (phase !== "running") return;
    // Only from the ground — no mid-air double jumps.
    if (playerY.current <= 0.5) velocity.current = JUMP_VELOCITY;
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump]);

  const end = useCallback(() => {
    once(() => {
      setPhase("grading");
      const metres = Math.floor(distance.current);
      void submit(metres).then((outcome) => {
        if (outcome) showResult();
      });
    });
  }, [once, submit, showResult]);

  useRaf(
    (dt) => {
      const speed = (34 + distance.current * 0.02) * difficulty;
      distance.current += speed * dt * 0.55;
      setScore(Math.floor(distance.current));

      // Player physics.
      velocity.current -= GRAVITY * dt;
      playerY.current = Math.max(0, playerY.current + velocity.current * dt);
      if (playerY.current === 0) velocity.current = 0;

      // Obstacles march left; spawn on a jittered timer.
      nextSpawn.current -= dt;
      const spawned = [...obstacles.current];
      if (nextSpawn.current <= 0) {
        spawned.push({ x: 105, height: 7 + Math.random() * 6 });
        nextSpawn.current = (0.9 + Math.random() * 0.9) / difficulty;
      }
      obstacles.current = spawned
        .map((o) => ({ ...o, x: o.x - speed * dt }))
        .filter((o) => o.x > -12);

      // Collision: overlapping boxes on both axes. A hit costs a life and
      // buys a moment of grace rather than ending the run outright.
      graceRef.current = Math.max(0, graceRef.current - dt);
      if (graceRef.current === 0) {
        for (const obstacle of obstacles.current) {
          const overlapX =
            obstacle.x < PLAYER_X + PLAYER_SIZE * 0.7 &&
            obstacle.x + 7 > PLAYER_X;
          if (overlapX && playerY.current < obstacle.height * 0.85) {
            livesRef.current -= 1;
            setLives(livesRef.current);
            if (livesRef.current <= 0) {
              end();
              return;
            }
            graceRef.current = 1.4;
            // Clear what's already on top of the runner so the grace period
            // is actually survivable.
            obstacles.current = obstacles.current.filter(
              (o) => o.x > PLAYER_X + 24
            );
            break;
          }
        }
      }

      setFrame({
        y: playerY.current,
        obstacles: obstacles.current,
        hurt: graceRef.current > 0,
      });
    },
    phase === "running"
  );

  const start = () => {
    playerY.current = 0;
    velocity.current = 0;
    obstacles.current = [];
    distance.current = 0;
    nextSpawn.current = 1.2;
    graceRef.current = 0;
    livesRef.current = startingLives;
    setScore(0);
    setLives(startingLives);
    setFrame({ y: 0, obstacles: [], hurt: false });
    setPhase("running");
  };

  return (
    <div className="w-full">
      <Hud
        items={[
          { label: "Distance", value: `${score} m` },
          { label: "Lives", value: "❤️".repeat(Math.max(lives, 0)) || "—" },
        ]}
      />
      <Stage
        ratio="3 / 2"
        className="bg-gradient-to-b from-sky-200 to-sky-50"
        onPointerDown={jump}
      >
        {/* Ground */}
        <div
          className="absolute inset-x-0"
          style={{
            top: `${GROUND_Y + PLAYER_SIZE}%`,
            bottom: 0,
            background: groundColor,
          }}
          aria-hidden
        />

        {/* Runner. Emoji people face left by default and the obstacles come
            from the right, so the sprite is mirrored to face the way it runs. */}
        <div
          className="absolute flex items-end justify-center"
          style={{
            left: `${PLAYER_X}%`,
            top: `${GROUND_Y - frame.y}%`,
            width: `${PLAYER_SIZE}%`,
            fontSize: "clamp(20px, 7vw, 40px)",
            lineHeight: 1,
            transform: "scaleX(-1)",
            // Flashes while the post-hit grace period is running.
            opacity: frame.hurt ? 0.45 : 1,
          }}
        >
          {runner}
        </div>

        {frame.obstacles.map((obstacle, i) => (
          <div
            key={i}
            className="absolute flex items-end justify-center"
            style={{
              left: `${obstacle.x}%`,
              top: `${GROUND_Y + PLAYER_SIZE - obstacle.height}%`,
              height: `${obstacle.height}%`,
              width: "7%",
              fontSize: "clamp(18px, 6vw, 34px)",
              lineHeight: 1,
            }}
          >
            {obstacleEmoji}
          </div>
        ))}

        {phase === "idle" && (
          <StartOverlay
            title="Ready to run?"
            hint={`Tap the screen (or press space) to jump. You get ${startingLives} ${
              startingLives === 1 ? "life" : "lives"
            }.`}
            buttonLabel="Start running"
            accent={accent}
            onStart={start}
          />
        )}
        {phase === "grading" && <GradingOverlay />}
      </Stage>
      <p className="mt-2 text-center text-sm text-zinc-500">
        Tap anywhere to jump.
      </p>
    </div>
  );
}
