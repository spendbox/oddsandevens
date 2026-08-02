"use client";

// Match three.
//
// Swap two neighbours, line up three or more, and everything above falls into
// the gap — which lands more matches, which is where the points are. A move
// that only makes one match is worth a fraction of a move that starts a
// cascade, so the game is about looking one step ahead rather than tapping
// quickly, and the board can rank people on a week's leaderboard.
//
// The jewels are built in CSS (`.gem` in globals.css): a lit dome, a specular
// highlight, bounce light underneath, a cast shadow. Each type also has its
// own *shape* as well as its own colour — a board that can only be read by
// hue is unplayable for the one in twelve men who can't separate red from
// green.

import { useCallback, useRef, useState } from "react";
import {
  GradingOverlay,
  Hud,
  Stage,
  StartOverlay,
  cfgNum,
  clamp,
  useOnce,
  type GameProps,
} from "./kit";

/** The jewels: colour, shape and a mark, so no two need the same sense. */
const JEWELS = [
  { colour: "#ef4444", shape: "round", mark: "" },
  { colour: "#3b82f6", shape: "cut", mark: "" },
  { colour: "#22c55e", shape: "round", mark: "✦" },
  { colour: "#eab308", shape: "cut", mark: "✦" },
  { colour: "#a855f7", shape: "round", mark: "●" },
  { colour: "#f97316", shape: "cut", mark: "▲" },
] as const;

/** Points per jewel cleared, and what a cascade multiplies them by. */
const PER_JEWEL = 30;
const CASCADE_STEP = 0.5;
/** A match longer than three is worth more per jewel. */
const LONG_MATCH_BONUS = 20;

type Cell = { id: number; jewel: number } | null;

interface Pos {
  r: number;
  c: number;
}

export default function MatchThree({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const size = clamp(Math.round(cfgNum(config, "size", 7)), 5, 8);
  const kinds = clamp(Math.round(cfgNum(config, "pieces", 5)), 4, JEWELS.length);
  const moveBudget = clamp(Math.round(cfgNum(config, "moves", 25)), 10, 60);

  const [phase, setPhase] = useState<"idle" | "running" | "grading">("idle");
  const [grid, setGrid] = useState<Cell[]>([]);
  const [picked, setPicked] = useState<Pos | null>(null);
  const [clearing, setClearing] = useState<Set<number>>(new Set());
  const [dropping, setDropping] = useState<Set<number>>(new Set());
  const [score, setScore] = useState(0);
  const [movesLeft, setMovesLeft] = useState(moveBudget);
  const [combo, setCombo] = useState(0);
  const [busy, setBusy] = useState(false);

  const scoreRef = useRef(0);
  const nextId = useRef(0);
  const once = useOnce();

  const at = useCallback((g: Cell[], r: number, c: number) => g[r * size + c], [size]);

  /** A fresh jewel. */
  const mint = useCallback(
    (avoid: number[] = []) => {
      const options = [...Array(kinds).keys()].filter((k) => !avoid.includes(k));
      const pool = options.length > 0 ? options : [...Array(kinds).keys()];
      return {
        id: nextId.current++,
        jewel: pool[Math.floor(Math.random() * pool.length)],
      };
    },
    [kinds]
  );

  /** Every run of three or more, in both directions. */
  const findMatches = useCallback(
    (g: Cell[]) => {
      const hits = new Set<number>();
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = at(g, r, c);
          if (!cell) continue;
          // Horizontal run starting here.
          if (c <= size - 3) {
            let end = c;
            while (end + 1 < size && at(g, r, end + 1)?.jewel === cell.jewel) end++;
            if (end - c >= 2) {
              for (let k = c; k <= end; k++) hits.add(r * size + k);
            }
          }
          if (r <= size - 3) {
            let end = r;
            while (end + 1 < size && at(g, end + 1, c)?.jewel === cell.jewel) end++;
            if (end - r >= 2) {
              for (let k = r; k <= end; k++) hits.add(k * size + c);
            }
          }
        }
      }
      return hits;
    },
    [size, at]
  );

  /** A starting board with no matches already on it and at least one move. */
  const freshBoard = useCallback((): Cell[] => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const g: Cell[] = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          // Don't hand the player a board that scores before they touch it.
          const avoid: number[] = [];
          const left = c >= 2 ? [g[r * size + c - 1], g[r * size + c - 2]] : [];
          const up = r >= 2 ? [g[(r - 1) * size + c], g[(r - 2) * size + c]] : [];
          if (left.length === 2 && left[0]?.jewel === left[1]?.jewel) {
            avoid.push(left[0]!.jewel);
          }
          if (up.length === 2 && up[0]?.jewel === up[1]?.jewel) {
            avoid.push(up[0]!.jewel);
          }
          g[r * size + c] = mint(avoid);
        }
      }
      if (findMatches(g).size === 0) return g;
    }
    return [];
  }, [size, mint, findMatches]);

  const end = useCallback(() => {
    once(() => {
      setPhase("grading");
      void submit(Math.max(scoreRef.current, 0)).then((outcome) => {
        if (outcome) showResult();
      });
    });
  }, [once, submit, showResult]);

  /**
   * Clear, drop, refill, repeat — the cascade. Each round through pays more
   * than the last, which is what makes a well-chosen swap worth several
   * lucky ones.
   */
  const settle = useCallback(
    async (start: Cell[]) => {
      let working = start;
      let chain = 0;

      for (;;) {
        const hits = findMatches(working);
        if (hits.size === 0) break;
        chain += 1;

        // Show them going.
        const goingIds = new Set<number>();
        for (const index of hits) {
          const cell = working[index];
          if (cell) goingIds.add(cell.id);
        }
        setClearing(goingIds);

        const multiplier = 1 + (chain - 1) * CASCADE_STEP;
        const extra = Math.max(hits.size - 3, 0) * LONG_MATCH_BONUS;
        scoreRef.current += Math.round((hits.size * PER_JEWEL + extra) * multiplier);
        setScore(scoreRef.current);
        setCombo(chain);

        await new Promise((resolve) => window.setTimeout(resolve, 240));

        // Take them out, then let the columns fall.
        const cleared = working.map((cell, i) => (hits.has(i) ? null : cell));
        const fell: Cell[] = [...cleared];
        const landed = new Set<number>();
        for (let c = 0; c < size; c++) {
          let write = size - 1;
          for (let r = size - 1; r >= 0; r--) {
            const cell = fell[r * size + c];
            if (cell) {
              fell[write * size + c] = cell;
              if (write !== r) landed.add(cell.id);
              write--;
            }
          }
          // Whatever is left at the top is new.
          for (let r = write; r >= 0; r--) {
            const cell = mint();
            fell[r * size + c] = cell;
            landed.add(cell.id);
          }
        }

        working = fell;
        setClearing(new Set());
        setDropping(landed);
        setGrid(working);
        await new Promise((resolve) => window.setTimeout(resolve, 200));
        setDropping(new Set());
      }

      setCombo(0);
      return working;
    },
    [findMatches, mint, size]
  );

  const swap = useCallback(
    async (a: Pos, b: Pos) => {
      setBusy(true);
      setPicked(null);

      const first = a.r * size + a.c;
      const second = b.r * size + b.c;
      const attempt = [...grid];
      [attempt[first], attempt[second]] = [attempt[second], attempt[first]];

      if (findMatches(attempt).size === 0) {
        // Not a move: show the swap, then put it back.
        setGrid(attempt);
        await new Promise((resolve) => window.setTimeout(resolve, 160));
        setGrid(grid);
        setBusy(false);
        return;
      }

      setGrid(attempt);
      const settled = await settle(attempt);
      setGrid(settled);

      const left = movesLeft - 1;
      setMovesLeft(left);
      setBusy(false);
      if (left <= 0) end();
    },
    [grid, size, findMatches, settle, movesLeft, end]
  );

  const tap = (r: number, c: number) => {
    if (phase !== "running" || busy) return;
    if (!picked) {
      setPicked({ r, c });
      return;
    }
    if (picked.r === r && picked.c === c) {
      setPicked(null);
      return;
    }
    const adjacent =
      Math.abs(picked.r - r) + Math.abs(picked.c - c) === 1;
    if (!adjacent) {
      setPicked({ r, c });
      return;
    }
    void swap(picked, { r, c });
  };

  const start = () => {
    scoreRef.current = 0;
    setScore(0);
    setMovesLeft(moveBudget);
    setPicked(null);
    setCombo(0);
    setGrid(freshBoard());
    setPhase("running");
  };

  return (
    <div className="flex w-full flex-col">
      <Hud
        items={[
          { label: "Score", value: score, icon: "💎" },
          { label: "Moves left", value: movesLeft, icon: "🔁" },
          ...(combo > 1
            ? [{ label: "Cascade", value: `×${combo}`, icon: "🔥" }]
            : []),
        ]}
      />

      <Stage
        ratio="1 / 1"
        className="bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 p-[3%]"
      >
        <div
          className="grid h-full w-full gap-[2%]"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: size * size }, (_, i) => {
            const cell = grid[i];
            const r = Math.floor(i / size);
            const c = i % size;
            const jewel = cell ? JEWELS[cell.jewel] : null;
            const isPicked = picked?.r === r && picked?.c === c;
            return (
              <button
                key={i}
                onPointerDown={() => tap(r, c)}
                aria-label={`Row ${r + 1}, column ${c + 1}`}
                className="relative flex items-center justify-center rounded-lg transition"
                style={{
                  background: isPicked ? "rgb(255 255 255 / 0.16)" : undefined,
                  boxShadow: isPicked ? `0 0 0 2px ${accent}` : undefined,
                }}
              >
                {cell && jewel && (
                  <span
                    className={
                      "gem flex size-[86%] items-center justify-center text-[0.7em] font-bold text-white/70 " +
                      (jewel.shape === "cut" ? "gem-cut " : "") +
                      (clearing.has(cell.id)
                        ? "animate-clear "
                        : dropping.has(cell.id)
                          ? "animate-drop "
                          : "")
                    }
                    style={{ "--gem": jewel.colour } as React.CSSProperties}
                  >
                    {jewel.mark}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {phase === "idle" && (
          <StartOverlay
            title="Match three"
            hint={`Swap two neighbours to line up three. ${moveBudget} moves — cascades pay double.`}
            buttonLabel="Start matching"
            accent={accent}
            onStart={start}
          />
        )}
        {phase === "grading" && <GradingOverlay />}
      </Stage>
    </div>
  );
}
