"use client";

// The 2048 loop: swipe to slide, equal tiles merge, score is the sum of every
// merge. Optionally the tiers are named after the merchant's products.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GradingOverlay,
  Hud,
  Stage,
  cfgNum,
  cfgStr,
  useOnce,
  type GameProps,
} from "./kit";

type Board = number[][];
type Direction = "up" | "down" | "left" | "right";

const TIER_COLORS = [
  "#eee4da", "#ede0c8", "#f2b179", "#f59563", "#f67c5f",
  "#f65e3b", "#edcf72", "#edcc61", "#edc850", "#edc53f", "#edc22e",
];

function emptyBoard(size: number): Board {
  return Array.from({ length: size }, () => Array<number>(size).fill(0));
}

function addTile(board: Board): Board {
  const empty: [number, number][] = [];
  board.forEach((row, r) =>
    row.forEach((value, c) => {
      if (value === 0) empty.push([r, c]);
    })
  );
  if (empty.length === 0) return board;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const next = board.map((row) => [...row]);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

// Slide + merge one row to the left; every other direction is this with the
// board rotated into place.
function collapse(row: number[]): { row: number[]; gained: number } {
  const values = row.filter((v) => v !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] === values[i + 1]) {
      const merged = values[i] * 2;
      out.push(merged);
      gained += merged;
      i++;
    } else {
      out.push(values[i]);
    }
  }
  while (out.length < row.length) out.push(0);
  return { row: out, gained };
}

function transpose(board: Board): Board {
  return board[0].map((_, c) => board.map((row) => row[c]));
}

function move(board: Board, direction: Direction): { board: Board; gained: number } {
  let working = board.map((row) => [...row]);
  const vertical = direction === "up" || direction === "down";
  const reverse = direction === "right" || direction === "down";

  if (vertical) working = transpose(working);
  if (reverse) working = working.map((row) => [...row].reverse());

  let gained = 0;
  working = working.map((row) => {
    const result = collapse(row);
    gained += result.gained;
    return result.row;
  });

  if (reverse) working = working.map((row) => [...row].reverse());
  if (vertical) working = transpose(working);
  return { board: working, gained };
}

function sameBoard(a: Board, b: Board): boolean {
  return a.every((row, r) => row.every((value, c) => value === b[r][c]));
}

function hasMoves(board: Board): boolean {
  return (["up", "down", "left", "right"] as Direction[]).some(
    (d) => !sameBoard(board, move(board, d).board)
  );
}

export default function TileMerge({ config, accent, submit, showResult }: GameProps) {
  const size = Math.round(cfgNum(config, "size", 4)) === 5 ? 5 : 4;
  const words = cfgStr(config, "tileWords", "")
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);

  const [board, setBoard] = useState<Board>(() => addTile(addTile(emptyBoard(size))));
  const [score, setScore] = useState(0);
  const [grading, setGrading] = useState(false);
  const scoreRef = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const once = useOnce();

  const end = useCallback(() => {
    once(() => {
      setGrading(true);
      void submit(Math.max(scoreRef.current, 0)).then((outcome) => {
        if (outcome) showResult();
      });
    });
  }, [once, submit, showResult]);

  const applyMove = useCallback(
    (direction: Direction) => {
      if (grading) return;
      setBoard((current) => {
        const result = move(current, direction);
        if (sameBoard(current, result.board)) return current;
        scoreRef.current += result.gained;
        setScore(scoreRef.current);
        const next = addTile(result.board);
        if (!hasMoves(next)) window.setTimeout(end, 500);
        return next;
      });
    },
    [grading, end]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Direction> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      const direction = map[e.code];
      if (!direction) return;
      e.preventDefault();
      applyMove(direction);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyMove]);

  const label = (value: number) => {
    if (value === 0) return "";
    const tier = Math.log2(value) - 1; // 2 -> 0, 4 -> 1, ...
    return words[tier] ?? String(value);
  };

  return (
    <div className="w-full">
      <Hud items={[{ label: "Score", value: score, icon: "⚡" }]} />
      <Stage
        ratio="1 / 1"
        className="bg-gradient-to-b from-stone-400 to-stone-500 p-2"
        onPointerDown={(e) => {
          touchStart.current = { x: e.clientX, y: e.clientY };
        }}
      >
        <div
          className="absolute inset-0"
          onPointerUp={(e) => {
            const start = touchStart.current;
            touchStart.current = null;
            if (!start) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
            applyMove(
              Math.abs(dx) > Math.abs(dy)
                ? dx > 0
                  ? "right"
                  : "left"
                : dy > 0
                  ? "down"
                  : "up"
            );
          }}
        />
        <div
          className="grid h-full w-full gap-2"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {board.flatMap((row, r) =>
            row.map((value, c) => {
              const tier = value ? Math.min(Math.log2(value) - 1, TIER_COLORS.length - 1) : -1;
              return (
                <div
                  key={`${r}-${c}`}
                  className="flex items-center justify-center rounded-lg text-center font-bold transition-colors"
                  style={{
                    background: value === 0 ? "rgba(255,255,255,0.35)" : TIER_COLORS[tier],
                    color: value >= 8 ? "#ffffff" : "#57534e",
                    fontSize: size === 5 ? "clamp(9px, 3vw, 15px)" : "clamp(11px, 4vw, 20px)",
                    padding: "2px",
                    lineHeight: 1.1,
                    overflow: "hidden",
                  }}
                >
                  {label(value)}
                </div>
              );
            })
          )}
        </div>
        {grading && <GradingOverlay />}
      </Stage>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">Swipe to merge. Arrow keys work too.</p>
        <button onClick={end} className="btn-ghost" style={{ color: accent }}>
          I&apos;m done
        </button>
      </div>
    </div>
  );
}
