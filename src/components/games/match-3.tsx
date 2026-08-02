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
//
// Moves are made by dragging: the jewel follows the finger, the neighbour it
// would displace slides the other way, and letting go either completes the
// swap or springs it back. A tap still selects, because a drag needs a pointer
// and a keyboard doesn't have one.

import { useCallback, useRef, useState } from "react";
import {
  GradingOverlay,
  Hud,
  Stage,
  StartOverlay,
  cfgNum,
  cfgStr,
  clamp,
  useOnce,
  type GameProps,
} from "./kit";
import { emojiList } from "@/lib/games/catalog";

/**
 * The default jewels: colour, shape and a mark, so no two need the same
 * sense. A business can replace the faces with its own — see `faces` below —
 * and the colour and shape stay, so the board is still readable to anyone who
 * can't separate red from green.
 */
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

/**
 * How far a finger has to travel, as a fraction of one cell, before it counts
 * as a swipe rather than a tap — and before letting go completes the swap.
 * The gap between the two is deliberate: a drag that stops halfway is an
 * unfinished move, and springing it back is how the player is told so.
 */
const DEADZONE = 0.12;
const COMMIT = 0.36;
/** How much of a drag past the neighbour still shows, so the board has give. */
const RUBBER = 0.15;
/** Time the jewel takes to slide the last of the way home. */
const SNAP_MS = 130;

type Cell = { id: number; jewel: number } | null;

interface Pos {
  r: number;
  c: number;
}

/** Where a drag began, in page pixels, and how big a cell is there. */
interface DragOrigin {
  from: Pos;
  x0: number;
  y0: number;
  /** Centre-to-centre distance to a neighbour, gap included. */
  pitch: number;
}

/** What the board is currently showing mid-drag. */
interface Drag {
  from: Pos;
  to: Pos | null;
  dx: number;
  dy: number;
  /** True once the finger is off and the jewel is animating to rest. */
  settling: boolean;
}

/** Resistance past the neighbour: it keeps moving, but grudgingly. */
function damped(travel: number, limit: number) {
  if (travel <= limit) return travel;
  return limit + Math.min((travel - limit) * RUBBER, limit * 0.25);
}

export default function MatchThree({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const size = clamp(Math.round(cfgNum(config, "size", 7)), 5, 8);
  const kinds = clamp(Math.round(cfgNum(config, "pieces", 5)), 4, JEWELS.length);
  // What the business put on the jewels. Empty means plain gems.
  const faces = emojiList(cfgStr(config, "jewels", ""), []);
  const moveBudget = clamp(Math.round(cfgNum(config, "moves", 25)), 10, 60);

  const [phase, setPhase] = useState<"idle" | "running" | "grading">("idle");
  const [grid, setGrid] = useState<Cell[]>([]);
  const [picked, setPicked] = useState<Pos | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [clearing, setClearing] = useState<Set<number>>(new Set());
  const [dropping, setDropping] = useState<Set<number>>(new Set());
  const [score, setScore] = useState(0);
  const [movesLeft, setMovesLeft] = useState(moveBudget);
  const [combo, setCombo] = useState(0);
  const [busy, setBusy] = useState(false);

  const scoreRef = useRef(0);
  const nextId = useRef(0);
  const originRef = useRef<DragOrigin | null>(null);
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

  /** Tap-to-select, still here for keyboards and for people who prefer it. */
  const tap = useCallback(
    (r: number, c: number) => {
      if (phase !== "running" || busy) return;
      if (!picked) {
        setPicked({ r, c });
        return;
      }
      if (picked.r === r && picked.c === c) {
        setPicked(null);
        return;
      }
      const adjacent = Math.abs(picked.r - r) + Math.abs(picked.c - c) === 1;
      if (!adjacent) {
        setPicked({ r, c });
        return;
      }
      void swap(picked, { r, c });
    },
    [phase, busy, picked, swap]
  );

  /**
   * Turns a finger's position into what the board should look like: which
   * neighbour is being pushed at, and how far the two jewels have moved.
   *
   * The dominant axis wins outright — a diagonal drag is read as whichever of
   * the two directions is further along, because there is no diagonal move to
   * make and guessing wrong is worse than committing.
   */
  const resolveDrag = useCallback(
    (origin: DragOrigin, x: number, y: number) => {
      const dx = x - origin.x0;
      const dy = y - origin.y0;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const along = horizontal ? dx : dy;
      const travel = Math.abs(along);
      const dir = along < 0 ? -1 : 1;

      const to = horizontal
        ? { r: origin.from.r, c: origin.from.c + dir }
        : { r: origin.from.r + dir, c: origin.from.c };
      const onBoard = to.r >= 0 && to.r < size && to.c >= 0 && to.c < size;

      // Dragging off the edge of the board gives a little and no more.
      const limit = onBoard ? origin.pitch : origin.pitch * 0.12;
      const shift = travel < origin.pitch * DEADZONE
        ? 0
        : dir * damped(travel, limit);

      return {
        to: onBoard && shift !== 0 ? to : null,
        dx: horizontal ? shift : 0,
        dy: horizontal ? 0 : shift,
        travel: travel / origin.pitch,
      };
    },
    [size]
  );

  const onPointerDown = (r: number, c: number, e: React.PointerEvent) => {
    if (phase !== "running" || busy) return;
    const button = e.currentTarget as HTMLElement;
    const cell = button.getBoundingClientRect().width;
    const row = button.parentElement?.getBoundingClientRect().width ?? cell * size;
    // The neighbour sits one cell plus one gap away; the gap is a percentage
    // of the board, so it has to be measured rather than assumed.
    const pitch =
      size > 1 ? cell + Math.max(row - cell * size, 0) / (size - 1) : cell;

    originRef.current = { from: { r, c }, x0: e.clientX, y0: e.clientY, pitch };
    button.setPointerCapture(e.pointerId);
    setDrag({ from: { r, c }, to: null, dx: 0, dy: 0, settling: false });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const origin = originRef.current;
    if (!origin) return;
    const next = resolveDrag(origin, e.clientX, e.clientY);
    setDrag({
      from: origin.from,
      to: next.to,
      dx: next.dx,
      dy: next.dy,
      settling: false,
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const origin = originRef.current;
    if (!origin) return;
    originRef.current = null;

    const { from } = origin;
    const next = resolveDrag(origin, e.clientX, e.clientY);

    if (next.travel < DEADZONE) {
      // Never moved: that was a tap.
      setDrag(null);
      tap(from.r, from.c);
      return;
    }

    if (!next.to || next.travel < COMMIT) {
      // Not far enough to mean it. Let it fall back.
      setDrag({ from, to: next.to, dx: 0, dy: 0, settling: true });
      window.setTimeout(() => setDrag(null), SNAP_MS);
      return;
    }

    // Committed: finish the slide, then let the board take over from there.
    const to = next.to;
    setBusy(true);
    setPicked(null);
    setDrag({
      from,
      to,
      dx: Math.sign(next.dx) * origin.pitch,
      dy: Math.sign(next.dy) * origin.pitch,
      settling: true,
    });
    window.setTimeout(() => {
      setDrag(null);
      void swap(from, to);
    }, SNAP_MS);
  };

  const onPointerCancel = () => {
    const origin = originRef.current;
    originRef.current = null;
    if (origin) setDrag(null);
  };

  const start = () => {
    scoreRef.current = 0;
    setScore(0);
    setMovesLeft(moveBudget);
    setPicked(null);
    setDrag(null);
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

            // The jewel under the finger goes with it; the one it is pushing
            // against goes the other way by the same amount, so the pair reads
            // as a single swap rather than two things moving.
            const held = drag?.from.r === r && drag?.from.c === c;
            const pushed = drag?.to?.r === r && drag?.to?.c === c;
            const shiftX = held ? drag.dx : pushed ? -drag.dx : 0;
            const shiftY = held ? drag.dy : pushed ? -drag.dy : 0;
            const moving = held || pushed;

            return (
              <button
                key={i}
                onPointerDown={(e) => onPointerDown(r, c, e)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                aria-label={`Row ${r + 1}, column ${c + 1}`}
                className="relative flex touch-none items-center justify-center rounded-lg"
                style={{
                  background: isPicked ? "rgb(255 255 255 / 0.16)" : undefined,
                  boxShadow: isPicked ? `0 0 0 2px ${accent}` : undefined,
                  // Lifted while it moves, so it passes over its neighbour
                  // instead of under it.
                  zIndex: held ? 3 : pushed ? 2 : undefined,
                  transform: moving
                    ? `translate3d(${shiftX}px, ${shiftY}px, 0)`
                    : undefined,
                  // Following a finger has to be exact; coming to rest is
                  // where the weight goes.
                  transition:
                    moving && !drag.settling
                      ? "none"
                      : `transform ${SNAP_MS}ms cubic-bezier(0.34, 1.4, 0.64, 1), background-color 150ms, box-shadow 150ms`,
                }}
              >
                {cell && jewel && (
                  <span
                    className={
                      "gem flex size-[86%] items-center justify-center " +
                      (jewel.shape === "cut" ? "gem-cut " : "") +
                      (clearing.has(cell.id)
                        ? "animate-clear "
                        : dropping.has(cell.id)
                          ? "animate-drop "
                          : "")
                    }
                    style={{ "--gem": jewel.colour } as React.CSSProperties}
                  >
                    {faces[cell.jewel] ? (
                      // The business's own thing, sitting *on* the jewel
                      // rather than replacing it — the colour and shape are
                      // what make the board readable, and they stay.
                      <span
                        className="emoji-piece text-[0.62em] leading-none"
                        style={{ filter: "drop-shadow(0 1px 1px rgb(0 0 0 / 0.35))" }}
                      >
                        {faces[cell.jewel]}
                      </span>
                    ) : (
                      <span className="text-[0.7em] font-bold text-white/70">
                        {jewel.mark}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {phase === "idle" && (
          <StartOverlay
            title="Match three"
            hint={`Drag a jewel onto its neighbour to line up three. ${moveBudget} moves — cascades pay double.`}
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
