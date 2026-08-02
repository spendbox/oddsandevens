"use client";

// Product recommender. Each answer scores a result key; the most-scored key
// wins and is shown with its blurb and link.

import { useState } from "react";
import { ActionButton, GradingOverlay, cfgList, cfgStr, type GameProps } from "./kit";

interface Outcome {
  key?: string;
  title?: string;
  blurb?: string;
  linkUrl?: string;
}

interface Question {
  prompt?: string;
  options?: { label?: string; outcome?: string }[];
}

export default function RecommenderQuiz({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const questions = cfgList<Question>(config, "questions", []).filter(
    (q) => (q.options ?? []).length > 0
  );
  const outcomes = cfgList<Outcome>(config, "outcomes", []);

  const [step, setStep] = useState(0);
  const [tally, setTally] = useState<Record<string, number>>({});
  const [match, setMatch] = useState<Outcome | null>(null);
  const [grading, setGrading] = useState(false);

  const answer = async (outcomeKey: string) => {
    const nextTally = {
      ...tally,
      [outcomeKey]: (tally[outcomeKey] ?? 0) + 1,
    };
    setTally(nextTally);

    if (step + 1 < questions.length) {
      setStep(step + 1);
      return;
    }

    // Most-picked key wins; ties fall to the first result the merchant listed.
    const best = outcomes.reduce<{ outcome: Outcome | null; score: number }>(
      (acc, outcome) => {
        const score = nextTally[String(outcome.key ?? "")] ?? 0;
        return score > acc.score ? { outcome, score } : acc;
      },
      { outcome: outcomes[0] ?? null, score: -1 }
    );
    setMatch(best.outcome);
    setGrading(true);
    await submit(1, { outcome: best.outcome?.key ?? null, answers: nextTally });
    setGrading(false);
  };

  if (questions.length === 0) {
    return (
      <p className="text-center text-sm text-zinc-500">
        This quiz has no questions yet.
      </p>
    );
  }

  if (match) {
    return (
      <div className="relative flex flex-col items-center gap-4 text-center">
        <span className="emoji text-4xl">✨</span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Your match
          </p>
          <h3 className="text-2xl font-bold text-zinc-900">
            {match.title ?? "Your pick"}
          </h3>
        </div>
        {match.blurb && (
          <p className="max-w-sm text-sm text-zinc-600">{match.blurb}</p>
        )}
        {match.linkUrl && (
          <a
            href={match.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
          >
            Take a look
          </a>
        )}
        <ActionButton onClick={showResult} accent={accent} disabled={grading}>
          {grading ? "One second…" : "Continue"}
        </ActionButton>
        {grading && <GradingOverlay label="Saving your match…" />}
      </div>
    );
  }

  const question = questions[step];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Question {step + 1} of {questions.length}
        </p>
        <h3 className="mt-1 text-xl font-bold text-zinc-900">
          {question.prompt ?? ""}
        </h3>
        {step === 0 && cfgStr(config, "intro", "") && (
          <p className="mt-2 text-sm text-zinc-500">{cfgStr(config, "intro", "")}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {(question.options ?? []).map((option, i) => (
          <button
            key={i}
            onClick={() => answer(String(option.outcome ?? ""))}
            className="cursor-pointer rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left font-medium text-zinc-800 transition hover:border-transparent hover:text-white active:scale-[0.99]"
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = accent;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "";
            }}
          >
            {option.label ?? ""}
          </button>
        ))}
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${(step / questions.length) * 100}%`,
            backgroundColor: accent,
          }}
        />
      </div>
    </div>
  );
}
