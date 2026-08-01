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
          { label: "Question", value: `${step + 1}/${questions.length}` },
          { label: "Score", value: score },
          { label: "Correct", value: correct },
        ]}
      />

      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear"
          style={{
            width: `${(msLeft / (perQuestion * 1000)) * 100}%`,
            backgroundColor: msLeft < perQuestion * 300 ? "#e11d48" : accent,
          }}
        />
      </div>

      <h3 className="text-xl font-bold text-zinc-900">{question.prompt}</h3>

      <div className="flex flex-col gap-2">
        {(question.options ?? []).map((option, i) => {
          const revealed = picked !== null;
          const isAnswer = i === answerIndex;
          const isPicked = picked === i;
          return (
            <button
              key={i}
              onClick={() => answer(i)}
              disabled={revealed}
              className={
                "cursor-pointer rounded-xl border px-4 py-3 text-left font-medium transition disabled:cursor-default " +
                (revealed
                  ? isAnswer
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : isPicked
                      ? "border-rose-300 bg-rose-50 text-rose-900"
                      : "border-zinc-200 bg-white text-zinc-400"
                  : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.99]")
              }
            >
              {option}
            </button>
          );
        })}
      </div>

      {grading && <GradingOverlay />}
    </div>
  );
}
