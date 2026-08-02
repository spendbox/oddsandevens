"use client";

// Timed multiple-choice trivia. A correct answer is worth 100, plus up to 100
// more for the time left on the clock — which is what makes the leaderboard
// worth chasing.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GradingOverlay,
  Hud,
  cfgList,
  cfgNum,
  clamp,
  type GameProps,
} from "./kit";

/** One colour per answer slot, in the order they are drawn. */
const OPTION_SHADES = [
  "bg-gradient-to-b from-sky-400 to-sky-600 shadow-[0_5px_0_#075985]",
  "bg-gradient-to-b from-amber-400 to-amber-600 shadow-[0_5px_0_#92400e]",
  "bg-gradient-to-b from-violet-400 to-violet-600 shadow-[0_5px_0_#5b21b6]",
  "bg-gradient-to-b from-teal-400 to-teal-600 shadow-[0_5px_0_#115e59]",
];
const OPTION_MARKS = ["🔷", "🔶", "🟣", "🟢"];

interface Question {
  prompt?: string;
  options?: string[];
  answerIndex?: number;
}

export default function LeaderboardTrivia({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const questions = cfgList<Question>(config, "questions", []).filter(
    (q) => (q.options ?? []).length >= 2
  );
  const perQuestion = clamp(
    Math.round(cfgNum(config, "secondsPerQuestion", 15)),
    5,
    60
  );

  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [msLeft, setMsLeft] = useState(perQuestion * 1000);
  const [grading, setGrading] = useState(false);
  const scoreRef = useRef(0);
  const correctRef = useRef(0);
  // 0 means "not armed yet" — the clock effect stamps it when the question
  // goes live, keeping Date.now() out of render.
  const deadline = useRef(0);

  const finish = useCallback(async () => {
    setGrading(true);
    const outcome = await submit(scoreRef.current, {
      correct: correctRef.current,
      of: questions.length,
    });
    if (outcome) showResult();
    else setGrading(false);
  }, [submit, showResult, questions.length]);

  const advance = useCallback(() => {
    if (step + 1 < questions.length) {
      setStep(step + 1);
      setPicked(null);
      deadline.current = 0; // re-armed by the clock effect
      setMsLeft(perQuestion * 1000);
    } else {
      void finish();
    }
  }, [step, questions.length, perQuestion, finish]);

  const answer = useCallback(
    (index: number | null) => {
      if (picked !== null || grading) return;
      setPicked(index ?? -1);
      const question = questions[step];
      const answerIndex = Math.round(Number(question?.answerIndex ?? 1)) - 1;
      if (index !== null && index === answerIndex) {
        const remaining = Math.max(0, deadline.current - Date.now());
        const bonus = Math.round((remaining / (perQuestion * 1000)) * 100);
        scoreRef.current += 100 + bonus;
        correctRef.current += 1;
        setScore(scoreRef.current);
        setCorrect(correctRef.current);
      }
      window.setTimeout(advance, 1100);
    },
    [picked, grading, questions, step, perQuestion, advance]
  );

  // The clock: ticks the bar and forces an answer when it runs out.
  useEffect(() => {
    if (picked !== null || grading || questions.length === 0) return;
    if (deadline.current === 0) {
      deadline.current = Date.now() + perQuestion * 1000;
    }
    const id = setInterval(() => {
      const remaining = Math.max(0, deadline.current - Date.now());
      setMsLeft(remaining);
      if (remaining <= 0) answer(null);
    }, 100);
    return () => clearInterval(id);
  }, [picked, grading, answer, questions.length, perQuestion]);

  if (questions.length === 0) {
    return (
      <p className="text-center text-sm text-zinc-500">
        This quiz has no questions yet.
      </p>
    );
  }

  const question = questions[step];
  const answerIndex = Math.round(Number(question.answerIndex ?? 1)) - 1;

  return (
    <div className="relative flex flex-col gap-4">
      <Hud
        items={[
          { label: "Question", value: `${step + 1}/${questions.length}`, icon: "❓" },
          { label: "Score", value: score, icon: "⚡" },
          { label: "Correct", value: correct, icon: "✅" },
        ]}
      />

      {/* The clock is the drama: it drains, it turns red, it decides the
          score. It gets to be the widest thing on the screen. */}
      <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200 shadow-inner">
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{
            width: `${(msLeft / (perQuestion * 1000)) * 100}%`,
            background:
              msLeft < perQuestion * 300
                ? "linear-gradient(90deg, #fb7185, #e11d48)"
                : `linear-gradient(90deg, ${accent}, color-mix(in oklab, ${accent}, white 35%))`,
          }}
        />
      </div>

      <div
        className="flex min-h-28 items-center justify-center rounded-2xl p-5 text-center shadow-lg"
        style={{
          background: `linear-gradient(150deg, ${accent}, color-mix(in oklab, ${accent}, black 35%))`,
        }}
      >
        <h3 className="text-xl font-bold leading-snug text-white drop-shadow">
          {question.prompt}
        </h3>
      </div>

      {/* Four colours, one per slot — the shape of the answer is as much a
          memory as the words are. */}
      <div className="grid gap-2 sm:grid-cols-2">
        {(question.options ?? []).map((option, i) => {
          const revealed = picked !== null;
          const isAnswer = i === answerIndex;
          const isPicked = picked === i;
          const shade = OPTION_SHADES[i % OPTION_SHADES.length];
          return (
            <button
              key={i}
              onClick={() => answer(i)}
              disabled={revealed}
              className={
                "btn-answer !flex-row !justify-start gap-3 !text-left !text-sm !normal-case " +
                (revealed && !isAnswer && !isPicked ? "opacity-40 " : "") +
                (revealed
                  ? isAnswer
                    ? "bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-[0_5px_0_#065f46]"
                    : isPicked
                      ? "bg-gradient-to-b from-rose-400 to-rose-600 shadow-[0_5px_0_#9f1239]"
                      : shade
                  : shade)
              }
            >
              <span className="emoji shrink-0 text-xl">
                {revealed && isAnswer ? "✅" : revealed && isPicked ? "❌" : OPTION_MARKS[i % 4]}
              </span>
              <span className="min-w-0 flex-1">{option}</span>
            </button>
          );
        })}
      </div>

      {grading && <GradingOverlay />}
    </div>
  );
}
