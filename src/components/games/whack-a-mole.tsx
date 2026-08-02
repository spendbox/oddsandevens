"use client";

// Whack-a-mole. Holes pop on their own timers so the board never falls into a
// rhythm the player can memorise.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GradingOverlay,
  Hud,
  Stage,
  StartOverlay,
  cfgNum,
  cfgStr,
  clamp,
  useCountdown,
  useOnce,
  type GameProps,
} from "./kit";
import { difficultyScale } from "@/lib/games/catalog";

type HoleState = {
  visible: boolean;
  decoy: boolean;
  hit: boolean;
  /** When this one popped up — reaction time is the whole game. */
  shownAt: number;
  /** What the last hit here scored, floated above the hole for a moment. */
  points?: number;
};

/** A mole swatted the instant it appears; one swatted at the last moment. */
const HIT_MAX = 100;
const HIT_MIN = 20;
/** Hitting the decoy. */
const DECOY_PENALTY = 60;

export default function WhackAMole({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const [phase, setPhase] = useState<"idle" | "running" | "grading">("idle");
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const once = useOnce();

  const holeCount = clamp(Math.round(cfgNum(config, "holes", 9)), 4, 12);
  const duration = clamp(Math.round(cfgNum(config, "duration", 40)), 15, 180);
  const difficulty = difficultyScale(config);
  const target = cfgStr(config, "targetEmoji", "🐹");
  const decoy = cfgStr(config, "decoyEmoji", "💣");

  const [holes, setHoles] = useState<HoleState[]>(() =>
    Array.from({ length: holeCount }, () => ({
      visible: false,
      decoy: false,
      hit: false,
      shownAt: 0,
    }))
  );

  const end = useCallback(() => {
    once(() => {
      setPhase("grading");
      void submit(Math.max(scoreRef.current, 0)).then((outcome) => {
        if (outcome) showResult();
      });
    });
  }, [once, submit, showResult]);

  const timeLeft = useCountdown(duration, phase === "running", end);

  // One popper: every beat, a random empty hole shows something for a while.
  useEffect(() => {
    if (phase !== "running") return;
    const popEvery = Math.max(260, 720 / difficulty);
    const stayFor = Math.max(600, 1300 / difficulty);

    const id = setInterval(() => {
      setHoles((current) => {
        const empty = current
          .map((hole, i) => (hole.visible ? -1 : i))
          .filter((i) => i >= 0);
        if (empty.length === 0) return current;
        const index = empty[Math.floor(Math.random() * empty.length)];
        const next = [...current];
        next[index] = {
          visible: true,
          decoy: Math.random() < 0.25,
          hit: false,
          shownAt: Date.now(),
        };
        window.setTimeout(() => {
          setHoles((later) => {
            const cleared = [...later];
            cleared[index] = {
              visible: false,
              decoy: false,
              hit: false,
              shownAt: 0,
            };
            return cleared;
          });
        }, stayFor);
        return next;
      });
    }, popEvery);

    return () => clearInterval(id);
  }, [phase, difficulty]);

  const whack = (index: number) => {
    if (phase !== "running") return;
    const stayFor = Math.max(600, 1300 / difficulty);
    setHoles((current) => {
      const hole = current[index];
      if (!hole.visible || hole.hit) return current;

      // Reaction time is the skill: a mole hit the instant it appears is
      // worth five times one swatted just before it drops back down. Without
      // this, everyone who taps everything ends the round on the same number.
      const up = Date.now() - hole.shownAt;
      const freshness = clamp(1 - up / stayFor, 0, 1);
      const points = hole.decoy
        ? -DECOY_PENALTY
        : HIT_MIN + Math.round((HIT_MAX - HIT_MIN) * freshness);

      scoreRef.current = Math.max(scoreRef.current + points, 0);
      setScore(scoreRef.current);
      const next = [...current];
      next[index] = { ...hole, hit: true, points };
      return next;
    });
  };

  const start = () => {
    scoreRef.current = 0;
    setScore(0);
    setHoles(
      Array.from({ length: holeCount }, () => ({
        visible: false,
        decoy: false,
        hit: false,
        shownAt: 0,
      }))
    );
    setPhase("running");
  };

  const columns = holeCount % 3 === 0 ? 3 : 2;

  return (
    <div className="w-full">
      <Hud
        items={[
          { label: "Score", value: score, icon: "🔨" },
          { label: "Time left", value: `${timeLeft}s`, icon: "⏱️" },
        ]}
      />
      <Stage ratio="1 / 1" className="bg-gradient-to-b from-lime-200 via-amber-100 to-amber-200 p-3">
        <div
          className="grid h-full w-full gap-2"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {holes.map((hole, i) => (
            <button
              key={i}
              onPointerDown={() => whack(i)}
              aria-label={`Hole ${i + 1}`}
              className="relative flex items-center justify-center rounded-full border-4 border-amber-800/20 bg-amber-900/15 transition active:scale-95"
            >
              <span
                className="emoji-piece transition-transform duration-150"
                style={{
                  fontSize: "clamp(22px, 8vw, 44px)",
                  lineHeight: 1,
                  transform: hole.visible && !hole.hit ? "scale(1)" : "scale(0)",
                }}
              >
                {hole.decoy ? decoy : target}
              </span>

              {/* What that tap was worth, so the reward for being quick is
                  visible rather than implied. */}
              {hole.hit && hole.points !== undefined && (
                <span
                  className={
                    "animate-pop pointer-events-none absolute -top-1 text-sm font-extrabold drop-shadow " +
                    (hole.points >= 0 ? "text-emerald-700" : "text-rose-600")
                  }
                >
                  {hole.points >= 0 ? `+${hole.points}` : hole.points}
                </span>
              )}
            </button>
          ))}
        </div>

        {phase === "idle" && (
          <StartOverlay
            title="Whack them"
            hint={`Hit each ${target} the moment it shows — the faster, the more it scores. ${decoy} costs you points.`}
            buttonLabel="Start whacking"
            accent={accent}
            onStart={start}
          />
        )}
        {phase === "grading" && <GradingOverlay />}
      </Stage>
    </div>
  );
}
