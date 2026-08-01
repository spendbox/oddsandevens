"use client";

// Digital scavenger hunt. Codes are hidden in the real world; the player types
// them in here. Codes are compared case- and space-insensitively, because
// nobody types a code the way it was printed.

import { useState } from "react";
import { ActionButton, GradingOverlay, cfgList, cfgStr, type GameProps } from "./kit";

interface Stop {
  hint?: string;
  code?: string;
}

const normalise = (value: string) => value.trim().toUpperCase().replace(/\s+/g, "");

export default function ScavengerHunt({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const stops = cfgList<Stop>(config, "stops", []).filter(
    (s) => (s.code ?? "").trim().length > 0
  );

  const [found, setFound] = useState<number[]>([]);
  const [entry, setEntry] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);

  const check = () => {
    const value = normalise(entry);
    if (!value) return;
    const index = stops.findIndex((stop) => normalise(stop.code ?? "") === value);
    if (index < 0) {
      setFeedback("That code isn't one of ours — keep looking.");
    } else if (found.includes(index)) {
      setFeedback("You've already found that one.");
    } else {
      setFound([...found, index]);
      setFeedback("Found one! ✅");
    }
    setEntry("");
  };

  const finish = async () => {
    setGrading(true);
    const outcome = await submit(found.length, {
      found: found.length,
      of: stops.length,
    });
    if (outcome) showResult();
    else setGrading(false);
  };

  if (stops.length === 0) {
    return (
      <p className="text-center text-sm text-zinc-500">
        This hunt has no clues yet.
      </p>
    );
  }

  const allFound = found.length >= stops.length;

  return (
    <div className="relative flex flex-col gap-4">
      {cfgStr(config, "intro", "") && (
        <p className="text-sm text-zinc-600">{cfgStr(config, "intro", "")}</p>
      )}

      <ul className="flex flex-col gap-2">
        {stops.map((stop, i) => {
          const isFound = found.includes(i);
          return (
            <li
              key={i}
              className={
                "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition " +
                (isFound
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-zinc-200 bg-white text-zinc-700")
              }
            >
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: isFound ? "#059669" : accent }}
              >
                {isFound ? "✓" : i + 1}
              </span>
              <span className={isFound ? "line-through opacity-70" : ""}>
                {stop.hint || `Clue ${i + 1}`}
              </span>
            </li>
          );
        })}
      </ul>

      {!allFound && (
        <div className="flex gap-2">
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && check()}
            placeholder="Type a code you found"
            className="input-field flex-1 uppercase"
            autoCapitalize="characters"
            autoComplete="off"
          />
          <button onClick={check} className="btn-secondary">
            Check
          </button>
        </div>
      )}

      {feedback && <p className="text-sm text-zinc-600">{feedback}</p>}

      <ActionButton onClick={finish} accent={accent} disabled={grading}>
        {allFound
          ? "All found — claim my reward"
          : `Finish with ${found.length} of ${stops.length}`}
      </ActionButton>

      {grading && <GradingOverlay />}
    </div>
  );
}
