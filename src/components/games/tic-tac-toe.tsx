"use client";

// Tic-tac-toe against the house. The difficulty knob decides how often the
// house is beatable — "hard" plays a full minimax and never loses.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GradingOverlay,
  Hud,
  cfgNum,
  cfgStr,
  clamp,
  type GameProps,
} from "./kit";

type Cell = "p" | "h" | null;

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winnerOf(board: Cell[]): Cell | "draw" | null {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(Boolean) ? "draw" : null;
}

function emptyCells(board: Cell[]): number[] {
  return board.flatMap((cell, i) => (cell === null ? [i] : []));
}

// Minimax from the house's point of view: +1 house win, -1 player win.
function minimax(board: Cell[], houseTurn: boolean): { score: number; move: number } {
  const result = winnerOf(board);
  if (result === "h") return { score: 1, move: -1 };
  if (result === "p") return { score: -1, move: -1 };
  if (result === "draw") return { score: 0, move: -1 };

  let bestScore = houseTurn ? -2 : 2;
  let bestMove = -1;
  for (const move of emptyCells(board)) {
    const next = [...board];
    next[move] = houseTurn ? "h" : "p";
    const { score } = minimax(next, !houseTurn);
    if (houseTurn ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return { score: bestScore, move: bestMove };
}

function houseMove(board: Cell[], difficulty: string): number {
  const open = emptyCells(board);
  if (open.length === 0) return -1;
  if (difficulty === "easy") return open[Math.floor(Math.random() * open.length)];
  if (difficulty === "hard") return minimax(board, true).move;

  // "Normal": take a win, block a loss, otherwise play centre/corner/random.
  for (const mark of ["h", "p"] as const) {
    for (const move of open) {
      const next = [...board];
      next[move] = mark;
      if (winnerOf(next) === mark) return move;
    }
  }
  if (board[4] === null) return 4;
  const corners = [0, 2, 6, 8].filter((i) => board[i] === null);
  if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
  return open[Math.floor(Math.random() * open.length)];
}

export default function TicTacToe({ config, accent, submit, showResult }: GameProps) {
  const rounds = clamp(Math.round(cfgNum(config, "rounds", 1)), 1, 5);
  const difficulty = cfgStr(config, "difficulty", "normal");
  const playerMark = cfgStr(config, "playerMark", "❌");
  const houseMark = cfgStr(config, "houseMark", "⭕");

  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [round, setRound] = useState(1);
  const [wins, setWins] = useState(0);
  const [status, setStatus] = useState<"playing" | "between" | "grading">("playing");
  const [message, setMessage] = useState("Your move.");
  const winsRef = useRef(0);

  const finishAll = useCallback(() => {
    setStatus("grading");
    void submit(winsRef.current, { rounds }).then((outcome) => {
      if (outcome) showResult();
    });
  }, [submit, showResult, rounds]);

  const settle = useCallback(
    (result: Cell | "draw") => {
      if (result === "p") {
        winsRef.current += 1;
        setWins(winsRef.current);
        setMessage("You win this one! 🎉");
      } else if (result === "h") {
        setMessage("The house takes it.");
      } else {
        setMessage("A draw.");
      }
      setStatus("between");
    },
    []
  );

  const play = (index: number) => {
    if (status !== "playing" || board[index] !== null) return;
    const afterPlayer = [...board];
    afterPlayer[index] = "p";
    setBoard(afterPlayer);

    const playerResult = winnerOf(afterPlayer);
    if (playerResult) {
      settle(playerResult);
      return;
    }

    const move = houseMove(afterPlayer, difficulty);
    if (move < 0) {
      settle("draw");
      return;
    }
    const afterHouse = [...afterPlayer];
    afterHouse[move] = "h";
    // A beat before the house answers, so it reads as a move rather than a snap.
    window.setTimeout(() => {
      setBoard(afterHouse);
      const result = winnerOf(afterHouse);
      if (result) settle(result);
    }, 320);
  };

  useEffect(() => {
    if (status !== "between") return;
    const id = window.setTimeout(() => {
      if (round >= rounds) {
        finishAll();
        return;
      }
      setRound((r) => r + 1);
      setBoard(Array(9).fill(null));
      setMessage("Your move.");
      setStatus("playing");
    }, 1200);
    return () => clearTimeout(id);
  }, [status, round, rounds, finishAll]);

  return (
    <div className="w-full">
      <Hud
        items={[
          { label: "Round", value: `${round}/${rounds}` },
          { label: "Your wins", value: wins },
        ]}
      />
      <div className="relative mx-auto max-w-xs">
        <div className="grid grid-cols-3 gap-2">
          {board.map((cell, i) => (
            <button
              key={i}
              onClick={() => play(i)}
              disabled={status !== "playing" || cell !== null}
              aria-label={`Square ${i + 1}`}
              className="flex aspect-square items-center justify-center rounded-xl border-2 border-zinc-200 bg-white transition active:scale-95 disabled:cursor-default"
              style={{ fontSize: "clamp(26px, 10vw, 44px)", lineHeight: 1 }}
            >
              {cell === "p" ? playerMark : cell === "h" ? houseMark : ""}
            </button>
          ))}
        </div>
        {status === "grading" && (
          <div className="absolute inset-0 rounded-2xl">
            <GradingOverlay />
          </div>
        )}
      </div>
      <p
        className="mt-3 text-center text-sm font-medium"
        style={{ color: status === "between" ? accent : undefined }}
      >
        {message}
      </p>
    </div>
  );
}
