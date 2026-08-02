"use client";

// Myth vs fact. Two buttons per statement, then the explanation — the part
// that actually teaches the customer something.
//
// The round is dealt fresh by the server every time (see lib/games/questions),
// so it doesn't end after three statements and it isn't the same three twice.
// What ends it is getting three wrong: the score is how far you got, which is
// what makes it worth a leaderboard.

import { useEffect, useRef, useState } from "react";
import {
  ActionButton,
  GradingOverlay,
  Hud,
  cfgList,
  clamp,
  type GameProps,
} from "./kit";

interface Statement {
  text?: string;
  isFact?: boolean;
  explanation?: string;
}

/** Wrong answers allowed before the run ends. */
const MISTAKES_ALLOWED = 3;
/** A right answer, and the bonus for answering it quickly. */
const CORRECT_POINTS = 100;
const SPEED_BONUS = 100;
/** How long you have before the speed bonus is gone, in ms. */
const SPEED_WINDOW = 6000;

export default function MythFact({ config, accent, submit, showResult }: GameProps) {
  const statements = cfgList<Statement>(config, "statements", []).filter(
    (s) => (s.text ?? "").trim().length > 0
  );

  const [step, setStep] = useState(0);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [score, setScore] = useState(0);
  const [gained, setGained] = useState(0);
  const [grading, setGrading] = useState(false);
  const scoreRef = useRef(0);
  // Stamped when a statement goes on screen, so the answer can be timed.
  const shownAt = useRef(0);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [step]);

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

  const mistakesLeft = MISTAKES_ALLOWED - wrong;
  const lastOne = step + 1 >= statements.length || mistakesLeft <= 0;

  const answer = (saidFact: boolean) => {
    if (answered !== null) return;
    setAnswered(saidFact);
    if (saidFact !== isFact) {
      setWrong((w) => w + 1);
      setGained(0);
      return;
    }
    // Knowing it is worth a hundred; knowing it straight away is worth two.
    // Counting correct answers alone put every good player on the same score.
    const took = Date.now() - shownAt.current;
    const quickness = clamp(1 - took / SPEED_WINDOW, 0, 1);
    const points = CORRECT_POINTS + Math.round(SPEED_BONUS * quickness);
    scoreRef.current += points;
    setScore(scoreRef.current);
    setGained(points);
    setCorrect((c) => c + 1);
  };

  const next = async () => {
    if (!lastOne) {
      setStep(step + 1);
      setAnswered(null);
      return;
    }
    setGrading(true);
    const outcome = await submit(scoreRef.current, {
      correct,
      seen: step + 1,
      wrong,
    });
    if (outcome) showResult();
    else setGrading(false);
  };

  return (
    <div className="relative flex flex-col gap-4">
      <Hud
        items={[
          { label: "Score", value: score, icon: "⚡" },
          { label: "Correct", value: correct, icon: "✅" },
          {
            label: "Lives",
            value: "❤️".repeat(Math.max(mistakesLeft, 0)) || "💔",
            icon: "",
          },
        ]}
      />

      {/* The statement is the whole screen: big, centred, on the accent. */}
      <div
        className="flex min-h-40 items-center justify-center rounded-2xl p-6 text-center shadow-lg"
        style={{
          background: `linear-gradient(150deg, ${accent}, color-mix(in oklab, ${accent}, black 35%))`,
        }}
      >
        <p className="text-xl font-bold leading-snug text-white drop-shadow">
          {current.text}
        </p>
      </div>

      {answered === null ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => answer(false)}
            className="btn-answer bg-gradient-to-b from-rose-400 to-rose-600 shadow-[0_5px_0_#9f1239]"
          >
            <span className="emoji text-2xl">👎</span>
            MYTH
          </button>
          <button
            onClick={() => answer(true)}
            className="btn-answer bg-gradient-to-b from-emerald-400 to-emerald-600 shadow-[0_5px_0_#065f46]"
          >
            <span className="emoji text-2xl">👍</span>
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
              {wasRight ? `Correct! +${gained}` : "Not quite."} It&apos;s a{" "}
              {isFact ? "FACT" : "MYTH"}.
            </p>
            {current.explanation && <p className="mt-1">{current.explanation}</p>}
          </div>
          <ActionButton onClick={next} accent={accent} disabled={grading}>
            {lastOne
              ? mistakesLeft <= 0
                ? "Out of lives — see my score"
                : "See my result"
              : "Next statement"}
          </ActionButton>
        </div>
      )}

      {grading && <GradingOverlay />}
    </div>
  );
}
