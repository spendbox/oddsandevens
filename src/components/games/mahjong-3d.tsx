"use client";

// 3D Mahjong solitaire.
//
// Tiles are piled in layers. A tile can only be taken when nothing sits on top
// of it and one of its long sides is clear — which is the whole game: the
// board is a puzzle about order, not about spotting pairs.
//
// Two things worth knowing about the implementation.
//
// The board is *dealt by solving it backwards*. Faces aren't sprinkled at
// random and hoped over: the generator repeatedly takes two currently-free
// slots, gives them the same face, and marks them gone. Replaying that
// sequence forwards is a solution, so every board dealt can be cleared. A
// randomly-faced board is frequently impossible, and a player who loses to an
// impossible board doesn't come back.
//
// The depth is CSS (`.tile3d`): an ivory face, two lit side faces offset down
// and right, a shadow cast on the layer beneath, and each layer nudged up-left
// so the stack leans towards the light. No models, no textures, no download.
//
// The faces are vector icons, not emoji. The business still picks its tiles
// from the emoji picker, but what gets *drawn* is an icon shipped with the app:
// a device without the right emoji font renders a hollow box, and a board of
// identical boxes is a matching game you cannot play.

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
  useElementSize,
  useOnce,
  type GameProps,
} from "./kit";
import { emojiList } from "@/lib/games/catalog";
import { TileFace } from "@/lib/games/tile-icons";

/**
 * A slot in the pile. `x`/`y` are in half-tiles, which is what lets an upper
 * layer sit across the seam between two lower tiles the way a real stack does.
 */
interface Slot {
  id: number;
  layer: number;
  x: number;
  y: number;
}

interface Tile extends Slot {
  face: string;
  /** Which of the business's faces this is — picks the icon. */
  faceIndex: number;
}

/** Points for a pair, the penalty for a wrong guess, and the clearing bonus. */
const PAIR_POINTS = 100;
const WRONG_PENALTY = 20;
const CLEAR_BONUS = 25;

/** Layouts, in half-tile coordinates. Every one has an even tile count. */
function buildLayout(kind: string): Slot[] {
  const slots: Slot[] = [];
  let id = 0;
  const add = (layer: number, x: number, y: number) =>
    slots.push({ id: id++, layer, x, y });

  // Base: six across, four down.
  for (let c = 0; c < 6; c++) for (let r = 0; r < 4; r++) add(0, c * 2, r * 2);
  // Second layer sits on the seams, inset by one half-tile.
  for (let c = 0; c < 4; c++) for (let r = 0; r < 2; r++) add(1, c * 2 + 1, r * 2 + 1);

  if (kind === "tower") {
    for (let c = 0; c < 2; c++) for (let r = 0; r < 2; r++) add(2, c * 2 + 2, r * 2 + 1);
    add(3, 3, 2);
    add(3, 5, 2);
  } else {
    add(2, 3, 2);
    add(2, 5, 2);
  }
  return slots;
}

/** Two slots overlap when they sit within a tile's width and height. */
const overlaps = (a: Slot, b: Slot) =>
  Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2;

/** Free = nothing on top, and a clear side to slide out towards. */
function isFree(slot: Slot, board: Slot[]): boolean {
  const covered = board.some(
    (other) => other.layer > slot.layer && overlaps(other, slot)
  );
  if (covered) return false;
  const sameLayer = board.filter(
    (other) => other.layer === slot.layer && other.id !== slot.id
  );
  const blockedLeft = sameLayer.some(
    (o) => o.x === slot.x - 2 && Math.abs(o.y - slot.y) < 2
  );
  const blockedRight = sameLayer.some(
    (o) => o.x === slot.x + 2 && Math.abs(o.y - slot.y) < 2
  );
  return !blockedLeft || !blockedRight;
}

/**
 * Deal faces onto a set of slots so the board is guaranteed clearable: take
 * two free slots, give them a face, remove them, repeat.
 */
function deal(slots: Slot[], faces: string[]): Tile[] {
  const remaining = [...slots];
  const out: Tile[] = [];
  let next = 0;

  while (remaining.length >= 2) {
    const free = remaining.filter((slot) => isFree(slot, remaining));
    // A layout that can strand itself falls back to any two left, which is
    // still a legal board — just not a guaranteed-solvable one.
    const pool = free.length >= 2 ? free : remaining;
    const first = pool[Math.floor(Math.random() * pool.length)];
    const rest = pool.filter((s) => s.id !== first.id);
    const second = rest[Math.floor(Math.random() * rest.length)];
    const faceIndex = next % faces.length;
    const face = faces[faceIndex];
    next += 1;
    out.push(
      { ...first, face, faceIndex },
      { ...second, face, faceIndex }
    );
    remaining.splice(remaining.findIndex((s) => s.id === first.id), 1);
    remaining.splice(remaining.findIndex((s) => s.id === second.id), 1);
  }
  return out;
}

export default function Mahjong3D({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const faces = emojiList(cfgStr(config, "faces", "🍕 🍔 🌮 🍜 🍩 ☕ 🥗 🍣"), [
    "🍕",
    "🍔",
    "🌮",
    "🍜",
  ]);
  const layout = cfgStr(config, "layout", "pyramid");
  const timeLimit = clamp(Math.round(cfgNum(config, "timeLimit", 120)), 45, 300);

  const [phase, setPhase] = useState<"idle" | "running" | "grading">("idle");
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [lifting, setLifting] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [pairs, setPairs] = useState(0);
  const [wrong, setWrong] = useState(false);

  const scoreRef = useRef(0);
  const secondsLeft = useRef(timeLimit);
  const once = useOnce();
  // The board is measured so tiles can be sized in pixels: a face, its
  // thickness and its shadow all have to scale together, and percentage or
  // container units size them against the wrong thing.
  const {
    ref: boardRef,
    width: boardWidth,
    height: boardHeight,
  } = useElementSize<HTMLDivElement>();

  const end = useCallback(() => {
    once(() => {
      setPhase("grading");
      void submit(Math.max(scoreRef.current, 0)).then((outcome) => {
        if (outcome) showResult();
      });
    });
  }, [once, submit, showResult]);

  const timeLeft = useCountdown(timeLimit, phase === "running", end);
  useEffect(() => {
    secondsLeft.current = timeLeft;
  }, [timeLeft]);

  const take = (tile: Tile) => {
    if (phase !== "running" || lifting.length > 0) return;
    if (!isFree(tile, tiles)) return;

    if (picked === null) {
      setPicked(tile.id);
      return;
    }
    if (picked === tile.id) {
      setPicked(null);
      return;
    }

    const other = tiles.find((t) => t.id === picked);
    if (!other) {
      setPicked(tile.id);
      return;
    }

    if (other.face !== tile.face) {
      // A wrong guess costs, so the board rewards looking before tapping.
      scoreRef.current = Math.max(scoreRef.current - WRONG_PENALTY, 0);
      setScore(scoreRef.current);
      setPicked(tile.id);
      setWrong(true);
      window.setTimeout(() => setWrong(false), 320);
      return;
    }

    // A pair: lift them off, then take them out of the board.
    scoreRef.current += PAIR_POINTS;
    setScore(scoreRef.current);
    setPairs((p) => p + 1);
    setPicked(null);
    setLifting([other.id, tile.id]);
    window.setTimeout(() => {
      setTiles((current) => {
        const left = current.filter((t) => t.id !== other.id && t.id !== tile.id);
        if (left.length === 0) {
          // Cleared: the rest of the clock is the reward for being quick.
          scoreRef.current += secondsLeft.current * CLEAR_BONUS;
          setScore(scoreRef.current);
          window.setTimeout(end, 400);
        }
        return left;
      });
      setLifting([]);
    }, 300);
  };

  const start = () => {
    scoreRef.current = 0;
    setScore(0);
    setPairs(0);
    setPicked(null);
    setLifting([]);
    setTiles(deal(buildLayout(layout), faces));
    setPhase("running");
  };

  // The board's extent, so it can be scaled into whatever the stage is.
  const boardW = boardWidth;
  const boardH = boardHeight;
  const slots = tiles.length > 0 ? tiles : buildLayout(layout);
  const maxX = Math.max(...slots.map((s) => s.x)) + 2;
  const maxY = Math.max(...slots.map((s) => s.y)) + 2;
  /** Each layer leans up and left, which is what reads as height. */
  const lean = 0.34;

  return (
    <div className="flex w-full flex-col">
      <Hud
        items={[
          { label: "Score", value: score, icon: "🀄" },
          { label: "Pairs", value: pairs, icon: "✅" },
          { label: "Time left", value: `${timeLeft}s`, icon: "⏱️" },
        ]}
      />

      <Stage
        ratio="3 / 2"
        className="flex items-center justify-center bg-gradient-to-br from-emerald-800 via-emerald-900 to-teal-950 p-[5%]"
      >
        <div
          ref={boardRef}
          className={"relative size-full " + (wrong ? "animate-shake" : "")}
        >
          {tiles.map((tile) => {
            const free = isFree(tile, tiles);
            // One tile is two half-cells wide, and the board is scaled so the
            // whole stack fits whatever the stage turned out to be.
            const cellW = boardW / (maxX + 0.8);
            const cellH = boardH / (maxY + 0.8);
            const tileW = cellW * 2;
            const tileH = cellH * 2;
            return (
              <button
                key={tile.id}
                onPointerDown={() => take(tile)}
                aria-label={`Tile ${tile.face}`}
                className={
                  "tile3d absolute flex items-center justify-center " +
                  (free ? "tile3d-free " : "tile3d-blocked ") +
                  (picked === tile.id ? "tile3d-picked " : "") +
                  (lifting.includes(tile.id) ? "animate-lift " : "")
                }
                style={
                  {
                    left: `${(tile.x - tile.layer * lean + 0.4) * cellW}px`,
                    top: `${(tile.y - tile.layer * lean * 1.6 + 0.4) * cellH}px`,
                    width: `${tileW}px`,
                    height: `${tileH}px`,
                    // Higher layers draw over lower ones, and within a layer
                    // the row nearer the viewer wins.
                    zIndex: tile.layer * 100 + tile.y,
                    // Thickness scales with the tile, so the stack reads the
                    // same on a phone and a desktop.
                    ["--depth" as string]: `${Math.max(tileW * 0.09, 2)}px`,
                  } as React.CSSProperties
                }
              >
                <TileFace
                  face={tile.face}
                  index={tile.faceIndex}
                  size={tileW * 0.56}
                />
              </button>
            );
          })}
        </div>

        {phase === "idle" && (
          <StartOverlay
            title="Clear the stack"
            hint="Match two free tiles — nothing on top, one side open."
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
