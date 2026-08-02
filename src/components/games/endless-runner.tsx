"use client";

// One-button endless runner.
//
// The world is measured in units where the stage is 100 tall and as many wide
// as its aspect ratio makes it, and it is integrated in fixed slices — so the
// jump arc is the same arc on a phone, on a desktop, at 30fps or 144fps, and
// nothing tunnels through a cactus during a long frame.
//
// The jump has the three forgivenesses every runner needs: a coyote window so
// stepping off the edge of a frame still counts as grounded, a buffer so a tap
// landing a moment early still fires, and a variable height so a short tap is
// a short hop. Obstacle spacing is derived from the current speed and the time
// a jump actually takes, which means every gap is clearable — the game gets
// faster, never unfair.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GradingOverlay,
  Hud,
  Stage,
  StartOverlay,
  cfgNum,
  cfgStr,
  clamp,
  useFixedStep,
  useOnce,
  useWorld,
  type GameProps,
} from "./kit";
import { difficultyScale } from "@/lib/games/catalog";

// --- The world, in units of stage height ----------------------------------
const GROUND_Y = 76; // where the runner's feet rest
const PLAYER_X = 16;
const PLAYER_W = 10;
const PLAYER_H = 12;
const GRAVITY = 300; // units/s²
const JUMP_V = 125; // units/s -> a 26-unit apex, 0.83s in the air
const JUMP_CUT = 0.45; // releasing early keeps this much of the rise
const COYOTE = 0.1; // seconds after leaving the ground a jump still works
const BUFFER = 0.12; // seconds before landing a tap is remembered
const AIRTIME = (2 * JUMP_V) / GRAVITY;
/** Boxes shrink before they're compared — a graze shouldn't cost a life. */
const FORGIVE = 0.78;

interface Obstacle {
  id: number;
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
  // The world lives in refs (mutated 120 times a second); this snapshot is
  // what React actually renders, published once per frame.
  const [frame, setFrame] = useState<{
    y: number;
    obstacles: Obstacle[];
    hurt: boolean;
  }>({ y: 0, obstacles: [], hurt: false });

  const world = useWorld<HTMLDivElement>();
  // The physics loop needs the live width without re-subscribing every resize,
  // and a ref may not be written during render — so an effect keeps it in step.
  const widthRef = useRef(100);
  useEffect(() => {
    widthRef.current = world.unitsWide;
  }, [world.unitsWide]);

  const playerY = useRef(0); // height above the ground, in units
  const velocity = useRef(0);
  const grounded = useRef(true);
  const coyote = useRef(0);
  const buffered = useRef(0);
  const holding = useRef(false);
  const obstacles = useRef<Obstacle[]>([]);
  const nextId = useRef(0);
  const distance = useRef(0);
  const gapLeft = useRef(60);
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

  const press = useCallback(() => {
    if (phase !== "running") return;
    holding.current = true;
    buffered.current = BUFFER;
  }, [phase]);

  const release = useCallback(() => {
    holding.current = false;
    // Let go on the way up and the hop is a short one.
    if (velocity.current > 0) velocity.current *= JUMP_CUT;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        press();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") release();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerup", release);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerup", release);
    };
  }, [press, release]);

  const end = useCallback(() => {
    once(() => {
      setPhase("grading");
      const metres = Math.floor(distance.current / 6);
      void submit(metres).then((outcome) => {
        if (outcome) showResult();
      });
    });
  }, [once, submit, showResult]);

  useFixedStep(
    (dt) => {
      const speed = Math.min(48 + distance.current * 0.012, 105) * difficulty;
      distance.current += speed * dt;
      setScore(Math.floor(distance.current / 6));

      // --- Jump: coyote time, buffered input, variable height -------------
      coyote.current = grounded.current
        ? COYOTE
        : Math.max(0, coyote.current - dt);
      buffered.current = Math.max(0, buffered.current - dt);
      if (buffered.current > 0 && coyote.current > 0) {
        velocity.current = JUMP_V;
        grounded.current = false;
        coyote.current = 0;
        buffered.current = 0;
      }

      velocity.current -= GRAVITY * dt;
      playerY.current += velocity.current * dt;
      if (playerY.current <= 0) {
        playerY.current = 0;
        velocity.current = 0;
        grounded.current = true;
      }

      // --- Obstacles ------------------------------------------------------
      // The next gap is never shorter than the distance the runner covers in
      // one jump, so every obstacle that appears can be cleared.
      gapLeft.current -= speed * dt;
      if (gapLeft.current <= 0) {
        obstacles.current = [
          ...obstacles.current,
          {
            id: nextId.current++,
            x: widthRef.current + 8,
            height: 9 + Math.random() * 8,
          },
        ];
        const jumpDistance = speed * AIRTIME;
        gapLeft.current = jumpDistance * (1.25 + Math.random() * 0.9);
      }
      obstacles.current = obstacles.current
        .map((o) => ({ ...o, x: o.x - speed * dt }))
        .filter((o) => o.x > -14);

      // --- Collision: shrunken boxes on both axes -------------------------
      graceRef.current = Math.max(0, graceRef.current - dt);
      if (graceRef.current === 0) {
        const px = PLAYER_X + (PLAYER_W * (1 - FORGIVE)) / 2;
        const pw = PLAYER_W * FORGIVE;
        for (const obstacle of obstacles.current) {
          const ow = 8 * FORGIVE;
          const ox = obstacle.x + (8 * (1 - FORGIVE)) / 2;
          const overlapX = ox < px + pw && ox + ow > px;
          if (overlapX && playerY.current < obstacle.height * FORGIVE) {
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
              (o) => o.x > PLAYER_X + 28
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
    grounded.current = true;
    coyote.current = COYOTE;
    buffered.current = 0;
    obstacles.current = [];
    distance.current = 0;
    gapLeft.current = 70;
    graceRef.current = 0;
    livesRef.current = startingLives;
    setScore(0);
    setLives(startingLives);
    setFrame({ y: 0, obstacles: [], hurt: false });
    setPhase("running");
  };

  const size = (units: number) => `${units * world.pxPerUnit}px`;

  return (
    <div className="flex w-full flex-col">
      <Hud
        items={[
          { label: "Distance", value: `${score}m`, icon: "🏃" },
          {
            label: "Lives",
            value: "❤️".repeat(Math.max(lives, 0)) || "—",
            icon: "",
          },
        ]}
      />
      <Stage
        ratio="3 / 2"
        className="bg-gradient-to-b from-indigo-300 via-sky-200 to-amber-50"
        onPointerDown={press}
        innerRef={world.ref}
      >
        {/* Ground */}
        <div
          className="absolute inset-x-0"
          style={{
            top: `${GROUND_Y + PLAYER_H}%`,
            bottom: 0,
            background: groundColor,
          }}
          aria-hidden
        />

        {/* Runner. Emoji people face left by default and the obstacles come
            from the right, so the sprite is mirrored to face the way it runs. */}
        <div
          className="emoji-piece absolute flex items-end justify-center"
          style={{
            left: world.left(PLAYER_X),
            top: `${GROUND_Y - frame.y}%`,
            width: size(PLAYER_W),
            height: size(PLAYER_H),
            fontSize: size(PLAYER_H),
            transform: "scaleX(-1)",
            // Flashes while the post-hit grace period is running.
            opacity: frame.hurt ? 0.45 : 1,
          }}
        >
          {runner}
        </div>

        {frame.obstacles.map((obstacle) => (
          <div
            key={obstacle.id}
            className="emoji-piece absolute flex items-end justify-center"
            style={{
              left: world.left(obstacle.x),
              top: `${GROUND_Y + PLAYER_H - obstacle.height}%`,
              height: `${obstacle.height}%`,
              width: size(8),
              fontSize: size(obstacle.height),
            }}
          >
            {obstacleEmoji}
          </div>
        ))}

        {phase === "idle" && (
          <StartOverlay
            title="Ready to run?"
            hint={`Tap to jump — hold for a higher one. ${startingLives} ${
              startingLives === 1 ? "life" : "lives"
            }.`}
            buttonLabel="Start running"
            accent={accent}
            onStart={start}
          />
        )}
        {phase === "grading" && <GradingOverlay />}
      </Stage>
    </div>
  );
}
