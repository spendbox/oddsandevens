"use client";

// Myth vs fact. Two buttons per statement, then the explanation — the part
// that actually teaches the customer something.

import { useState } from "react";
import { ActionButton, GradingOverlay, cfgList, type GameProps } from "./kit";

interface Statement {
  text?: string;
  isFact?: boolean;
  explanation?: string;
}

export default function MythFact({ config, accent, submit, showResult }: GameProps) {
  const statements = cfgList<Statement>(config, "statements", []).filter(
    (s) => (s.text ?? "").trim().length > 0
  );

  const [step, setStep] = useState(0);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [correct, setCorrect] = useState(0);
  const [grading, setGrading] = useState(false);

  if (statements.length === 0) {
    return (
      <p className="text-center text-sm text-zinc-500">
        This game has no statements yet.
      </p>
    );
  }

  const current = statements[step];
  const isFact = current.isFact === true;
  const wasRight = answered !== null && answered === isFact;

  const answer = (saidFact: boolean) => {
    if (answered !== null) return;
    setAnswered(saidFact);
    if (saidFact === isFact) setCorrect((c) => c + 1);
  };

  const next = async () => {
    if (step + 1 < statements.length) {
      setStep(step + 1);
      setAnswered(null);
      return;
    }
    setGrading(true);
    const outcome = await submit(correct, { of: statements.length });
    if (outcome) showResult();
    else setGrading(false);
  };

  return (
    <div className="relative flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-500">
        <span>
          {step + 1} of {statements.length}
        </span>
        <span>
          {correct} correct
        </span>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-sm">
        <p className="text-lg font-semibold text-zinc-900">{current.text}</p>
      </div>

      {answered === null ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => answer(false)}
            className="cursor-pointer rounded-xl bg-rose-100 px-4 py-4 font-bold text-rose-700 transition hover:bg-rose-200 active:scale-95"
          >
            MYTH
          </button>
          <button
            onClick={() => answer(true)}
            className="cursor-pointer rounded-xl bg-emerald-100 px-4 py-4 font-bold text-emerald-700 transition hover:bg-emerald-200 active:scale-95"
          >
            FACT
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div
            className={
              "rounded-xl px-4 py-3 text-sm " +
              (wasRight
                ? "bg-emerald-50 text-emerald-800"
                : "bg-rose-50 text-rose-800")
            }
          >
            <p className="font-bold">
              {wasRight ? "Correct!" : "Not quite."} It&apos;s a{" "}
              {isFact ? "FACT" : "MYTH"}.
            </p>
            {current.explanation && <p className="mt-1">{current.explanation}</p>}
          </div>
          <ActionButton onClick={next} accent={accent} disabled={grading}>
            {step + 1 < statements.length ? "Next statement" : "See my result"}
          </ActionButton>
        </div>
      )}

      {grading && <GradingOverlay />}
    </div>
  );
}
