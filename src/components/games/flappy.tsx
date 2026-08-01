"use client";

// Tap-to-fly through the gaps. Percent-of-stage physics, one tap to play.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GradingOverlay,
  Hud,
  Stage,
  StartOverlay,
  cfgStr,
  clamp,
  useOnce,
  useRaf,
  type GameProps,
} from "./kit";
import { difficultyScale } from "@/lib/games/catalog";

const FLYER_X = 22;
const FLYER_SIZE = 9;
const GRAVITY = 150;
const FLAP = -58;
const GAP = 30; // % of stage height
const PIPE_WIDTH = 13;

interface Pipe {
  x: number;
  gapCenter: number;
  passed: boolean;
}

export default function Flappy({ config, accent, submit, showResult }: GameProps) {
  const [phase, setPhase] = useState<"idle" | "running" | "grading">("idle");
  const [score, setScore] = useState(0);
  // Physics in refs, one published snapshot per frame for React to render.
  const [frame, setFrame] = useState<{ y: number; tilt: number; pipes: Pipe[] }>({
    y: 45,
    tilt: 0,
    pipes: [],
  });

  const y = useRef(45);
  const velocity = useRef(0);
  const pipes = useRef<Pipe[]>([]);
  const scoreRef = useRef(0);
  const once = useOnce();

  const difficulty = difficultyScale(config);
  const flyer = cfgStr(config, "flyerEmoji", "🐤");
  const pipeColor = cfgStr(config, "pipeColor", "#16a34a");
  const gap = GAP / difficulty;
  const speed = 30 * difficulty;

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

  useRaf(
    (dt) => {
      velocity.current += GRAVITY * dt;
      y.current += velocity.current * dt;

      if (y.current < 0 || y.current > 100 - FLYER_SIZE) {
        end();
        return;
      }

      const spawned = [...pipes.current];
      if (spawned.length === 0 || spawned[spawned.length - 1].x < 55) {
        spawned.push({
          x: 105,
          gapCenter: 22 + Math.random() * 56,
          passed: false,
        });
      }
      pipes.current = spawned
        .map((p) => ({ ...p, x: p.x - speed * dt }))
        .filter((p) => p.x > -PIPE_WIDTH - 2);

      for (const pipe of pipes.current) {
        const overlapX =
          pipe.x < FLYER_X + FLYER_SIZE && pipe.x + PIPE_WIDTH > FLYER_X;
        if (overlapX) {
          const top = pipe.gapCenter - gap / 2;
          const bottom = pipe.gapCenter + gap / 2;
          if (y.current < top || y.current + FLYER_SIZE > bottom) {
            end();
            return;
          }
        }
        if (!pipe.passed && pipe.x + PIPE_WIDTH < FLYER_X) {
          pipe.passed = true;
          scoreRef.current += 1;
          setScore(scoreRef.current);
        }
      }
      setFrame({
        y: y.current,
        tilt: clamp(velocity.current, -40, 60),
        pipes: pipes.current,
      });
    },
    phase === "running"
  );

  const start = () => {
    y.current = 45;
    velocity.current = 0;
    pipes.current = [];
    scoreRef.current = 0;
    setScore(0);
    setFrame({ y: 45, tilt: 0, pipes: [] });
    setPhase("running");
  };

  return (
    <div className="w-full">
      <Hud items={[{ label: "Gates", value: score }]} />
      <Stage
        ratio="3 / 4"
        className="bg-gradient-to-b from-sky-300 to-sky-100"
        onPointerDown={flap}
      >
        {frame.pipes.map((pipe, i) => (
          <div key={i}>
            <div
              className="absolute rounded-b-md"
              style={{
                left: `${pipe.x}%`,
                top: 0,
                width: `${PIPE_WIDTH}%`,
                height: `${Math.max(pipe.gapCenter - gap / 2, 0)}%`,
                background: pipeColor,
              }}
            />
            <div
              className="absolute rounded-t-md"
              style={{
                left: `${pipe.x}%`,
                top: `${pipe.gapCenter + gap / 2}%`,
                width: `${PIPE_WIDTH}%`,
                bottom: 0,
                background: pipeColor,
              }}
            />
          </div>
        ))}

        <span
          className="absolute"
          style={{
            left: `${FLYER_X}%`,
            top: `${frame.y}%`,
            fontSize: "clamp(22px, 8vw, 38px)",
            lineHeight: 1,
            transform: `rotate(${frame.tilt}deg)`,
          }}
        >
          {flyer}
        </span>

        {phase === "idle" && (
          <StartOverlay
            title="Mind the gap"
            hint="Tap (or press space) to flap. Touch anything and the run ends."
            buttonLabel="Start flying"
            accent={accent}
            onStart={start}
          />
        )}
        {phase === "grading" && <GradingOverlay />}
      </Stage>
      <p className="mt-2 text-center text-sm text-zinc-500">Tap to flap.</p>
    </div>
  );
}
