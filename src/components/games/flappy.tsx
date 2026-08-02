"use client";

// Tap-to-fly through the gaps.
//
// Same physics discipline as the runner: a world measured in units of stage
// height, integrated in fixed slices, so the flap arc is identical on every
// device. Pipes are spaced by distance rather than by "the last one is past
// some line", which is what keeps the rhythm even as the game speeds up, and
// the gap is placed so consecutive gaps are always reachable from one another.

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

const FLYER_X = 24;
const FLYER_SIZE = 9;
const GRAVITY = 190; // units/s²
const FLAP = -72; // units/s, upward
const TERMINAL = 130; // fastest fall, so a long drop stays readable
const GAP = 30; // units of clear air
const PIPE_WIDTH = 14;
/** The bird's hitbox is smaller than the bird — clipping a leaf is fine. */
const FORGIVE = 0.72;

interface Pipe {
  id: number;
  x: number;
  gapCenter: number;
  passed: boolean;
}

export default function Flappy({ config, accent, submit, showResult }: GameProps) {
  const [phase, setPhase] = useState<"idle" | "running" | "grading">("idle");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  // Physics in refs, one published snapshot per frame for React to render.
  const [frame, setFrame] = useState<{
    y: number;
    tilt: number;
    pipes: Pipe[];
    hurt: boolean;
  }>({ y: 45, tilt: 0, pipes: [], hurt: false });

  const world = useWorld<HTMLDivElement>();
  // The physics loop needs the live width without re-subscribing every resize,
  // and a ref may not be written during render — so an effect keeps it in step.
  const widthRef = useRef(100);
  useEffect(() => {
    widthRef.current = world.unitsWide;
  }, [world.unitsWide]);

  const y = useRef(45);
  const velocity = useRef(0);
  const pipes = useRef<Pipe[]>([]);
  const nextId = useRef(0);
  const gapLeft = useRef(0);
  const lastCenter = useRef(50);
  const scoreRef = useRef(0);
  const livesRef = useRef(3);
  const graceRef = useRef(0);
  const once = useOnce();

  const difficulty = difficultyScale(config);
  const startingLives = clamp(Math.round(cfgNum(config, "lives", 3)), 1, 9);
  const flyer = cfgStr(config, "flyerEmoji", "🐤");
  const pipeColor = cfgStr(config, "pipeColor", "#16a34a");
  const gap = GAP / difficulty;
  const speed = 42 * difficulty;

  const flap = useCallback(() => {
    if (phase === "running") velocity.current = FLAP;
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap]);

  const end = useCallback(() => {
    once(() => {
      setPhase("grading");
      void submit(Math.max(scoreRef.current, 0)).then((outcome) => {
        if (outcome) showResult();
      });
    });
  }, [once, submit, showResult]);

  // A crash costs a life: the flyer is re-centred, the pipes around it are
  // cleared, and a short grace period keeps the next one survivable.
  const crash = useCallback(() => {
    livesRef.current -= 1;
    setLives(livesRef.current);
    if (livesRef.current <= 0) {
      end();
      return false;
    }
    y.current = 45;
    velocity.current = 0;
    graceRef.current = 1.4;
    pipes.current = pipes.current.filter((p) => p.x > FLYER_X + 34);
    return true;
  }, [end]);

  useFixedStep(
    (dt) => {
      graceRef.current = Math.max(0, graceRef.current - dt);

      velocity.current = Math.min(velocity.current + GRAVITY * dt, TERMINAL);
      y.current += velocity.current * dt;

      if (y.current < 0 || y.current > 100 - FLYER_SIZE) {
        if (!crash()) return;
      }

      // --- Pipes, spaced by distance --------------------------------------
      gapLeft.current -= speed * dt;
      if (gapLeft.current <= 0) {
        // The next gap sits within one comfortable climb of the last one, so
        // the run never demands an impossible jump between two gaps.
        const drift = 26;
        const center = clamp(
          lastCenter.current + (Math.random() * 2 - 1) * drift,
          gap / 2 + 8,
          100 - gap / 2 - 8
        );
        lastCenter.current = center;
        pipes.current = [
          ...pipes.current,
          {
            id: nextId.current++,
            x: widthRef.current + 4,
            gapCenter: center,
            passed: false,
          },
        ];
        gapLeft.current = 52 + Math.random() * 12;
      }
      pipes.current = pipes.current
        .map((p) => ({ ...p, x: p.x - speed * dt }))
        .filter((p) => p.x > -PIPE_WIDTH - 4);

      // --- Collision -------------------------------------------------------
      if (graceRef.current === 0) {
        const inset = (FLYER_SIZE * (1 - FORGIVE)) / 2;
        const bx = FLYER_X + inset;
        const bw = FLYER_SIZE * FORGIVE;
        const by = y.current + inset;
        const bh = FLYER_SIZE * FORGIVE;
        for (const pipe of pipes.current) {
          const overlapX = pipe.x < bx + bw && pipe.x + PIPE_WIDTH > bx;
          if (!overlapX) continue;
          const top = pipe.gapCenter - gap / 2;
          const bottom = pipe.gapCenter + gap / 2;
          if (by < top || by + bh > bottom) {
            if (!crash()) return;
            break;
          }
        }
      }

      // Score every gate the flyer has just cleared.
      let gained = 0;
      pipes.current = pipes.current.map((pipe) => {
        if (pipe.passed || pipe.x + PIPE_WIDTH >= FLYER_X) return pipe;
        gained += 1;
        return { ...pipe, passed: true };
      });
      if (gained > 0) {
        scoreRef.current += gained;
        setScore(scoreRef.current);
      }

      setFrame({
        y: y.current,
        // Nose follows the flight path: up when climbing, down when diving.
        tilt: clamp(velocity.current * 0.55, -28, 65),
        pipes: pipes.current,
        hurt: graceRef.current > 0,
      });
    },
    phase === "running"
  );

  const start = () => {
    y.current = 45;
    velocity.current = 0;
    pipes.current = [];
    gapLeft.current = 40;
    lastCenter.current = 50;
    scoreRef.current = 0;
    livesRef.current = startingLives;
    graceRef.current = 0;
    setScore(0);
    setLives(startingLives);
    setFrame({ y: 45, tilt: 0, pipes: [], hurt: false });
    setPhase("running");
  };

  const size = (units: number) => `${units * world.pxPerUnit}px`;

  return (
    <div className="flex w-full flex-col">
      <Hud
        items={[
          { label: "Gates", value: score, icon: "🚪" },
          {
            label: "Lives",
            value: "❤️".repeat(Math.max(lives, 0)) || "—",
            icon: "",
          },
        ]}
      />
      <Stage
        ratio="2 / 3"
        className="bg-gradient-to-b from-sky-400 via-sky-200 to-amber-100"
        onPointerDown={flap}
        innerRef={world.ref}
      >
        {frame.pipes.map((pipe) => (
          <div key={pipe.id}>
            <div
              className="absolute rounded-b-lg shadow-md"
              style={{
                left: world.left(pipe.x),
                top: 0,
                width: size(PIPE_WIDTH),
                height: `${Math.max(pipe.gapCenter - gap / 2, 0)}%`,
                background: pipeColor,
              }}
            />
            <div
              className="absolute rounded-t-lg shadow-md"
              style={{
                left: world.left(pipe.x),
                top: `${pipe.gapCenter + gap / 2}%`,
                width: size(PIPE_WIDTH),
                bottom: 0,
                background: pipeColor,
              }}
            />
          </div>
        ))}

        <span
          className="emoji-piece absolute"
          style={{
            left: world.left(FLYER_X),
            top: `${frame.y}%`,
            fontSize: size(FLYER_SIZE),
            transform: `rotate(${frame.tilt}deg)`,
            opacity: frame.hurt ? 0.45 : 1,
          }}
        >
          {flyer}
        </span>

        {phase === "idle" && (
          <StartOverlay
            title="Mind the gap"
            hint={`Tap to flap. ${startingLives} ${
              startingLives === 1 ? "life" : "lives"
            }.`}
            buttonLabel="Start flying"
            accent={accent}
            onStart={start}
          />
        )}
        {phase === "grading" && <GradingOverlay />}
      </Stage>
    </div>
  );
}
