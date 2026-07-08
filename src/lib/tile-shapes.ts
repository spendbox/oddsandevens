// Geometry for the interlocking tile shapes. Tiles tessellate on a
// checkerboard: tiles where (row + col) is even push tabs OUT on every
// interior edge, odd tiles carry the matching notches (IN). Grid-border
// edges stay flat, so a shared edge is always one tab meeting one notch.
//
// Each interlocking tile renders as an oversized box (inset -TAB on every
// side of its grid cell) so tabs can reach into the neighbouring cells;
// "out" tiles get a higher z-index and draw their tabs over the notches.

import type React from "react";

export type EdgeKind = "flat" | "out" | "in";

export interface TileEdges {
  top: EdgeKind;
  right: EdgeKind;
  bottom: EdgeKind;
  left: EdgeKind;
}

// Tab overhang as a fraction of the cell size.
export const TAB = 0.22;

// Cell boundary inside the oversized box's own unit space.
const M = TAB / (1 + 2 * TAB);

export function edgesFor(
  row: number,
  col: number,
  rows: number,
  cols: number
): TileEdges {
  const kind: EdgeKind = (row + col) % 2 === 0 ? "out" : "in";
  return {
    top: row === 0 ? "flat" : kind,
    right: col === cols - 1 ? "flat" : kind,
    bottom: row === rows - 1 ? "flat" : kind,
    left: col === 0 ? "flat" : kind,
  };
}

// Stable identifier for an edge combination, used as an SVG clipPath id
// suffix so the play board only registers each distinct silhouette once.
export function edgesKey(edges: TileEdges): string {
  return [edges.top, edges.right, edges.bottom, edges.left]
    .map((e) => e[0])
    .join("");
}

export function isOutTile(row: number, col: number): boolean {
  return (row + col) % 2 === 0;
}

const round = (n: number) => Math.round(n * 10000) / 10000;

// ---------------------------------------------------------------------------
// Sharp interlock: a trapezoid tab/notch per edge, emitted as a CSS
// percentage polygon (responsive, no SVG needed).
// ---------------------------------------------------------------------------

// Corners of the tile in box space, clockwise per edge.
const EDGE_FRAME: Record<
  keyof TileEdges,
  { sx: number; sy: number; ex: number; ey: number; nx: number; ny: number }
> = {
  top: { sx: M, sy: M, ex: 1 - M, ey: M, nx: 0, ny: -1 },
  right: { sx: 1 - M, sy: M, ex: 1 - M, ey: 1 - M, nx: 1, ny: 0 },
  bottom: { sx: 1 - M, sy: 1 - M, ex: M, ey: 1 - M, nx: 0, ny: 1 },
  left: { sx: M, sy: 1 - M, ex: M, ey: M, nx: -1, ny: 0 },
};

// Map a point given as (t along the edge, h above it) into box space.
function edgePoint(
  frame: (typeof EDGE_FRAME)["top"],
  sign: 1 | -1,
  t: number,
  h: number
): [number, number] {
  return [
    frame.sx + t * (frame.ex - frame.sx) + sign * h * frame.nx,
    frame.sy + t * (frame.ey - frame.sy) + sign * h * frame.ny,
  ];
}

// A tab profile is a list of (t along the edge, h as a fraction of the tab
// depth M) points describing one out-tab; in-notches are the same profile
// mirrored inward (sign flips), so an out-tab always matches its neighbour's
// notch and the board tessellates for any profile.
type TabProfile = [number, number][];

const TRAPEZOID_TAB: TabProfile = [
  [0.36, 0],
  [0.44, 1],
  [0.56, 1],
  [0.64, 0],
];
// A single triangular point instead of a plateau.
const CHEVRON_TAB: TabProfile = [
  [0.3, 0],
  [0.5, 1],
  [0.7, 0],
];

function tabPolygon(edges: TileEdges, profile: TabProfile): string {
  const points: [number, number][] = [];
  (["top", "right", "bottom", "left"] as const).forEach((name) => {
    const frame = EDGE_FRAME[name];
    const kind = edges[name];
    points.push([frame.sx, frame.sy]);
    if (kind === "flat") return;
    const sign = kind === "out" ? 1 : -1;
    for (const [t, h] of profile) points.push(edgePoint(frame, sign, t, h * M));
  });
  return `polygon(${points
    .map(([x, y]) => `${round(x * 100)}% ${round(y * 100)}%`)
    .join(", ")})`;
}

export function sharpClipPolygon(edges: TileEdges): string {
  return tabPolygon(edges, TRAPEZOID_TAB);
}

export function chevronClipPolygon(edges: TileEdges): string {
  return tabPolygon(edges, CHEVRON_TAB);
}

// ---------------------------------------------------------------------------
// Curved interlock: a jigsaw knob per edge. CSS path() is px-only, so the
// play board registers these as SVG <clipPath clipPathUnits="objectBoundingBox">
// defs and tiles reference them by url(#...).
// ---------------------------------------------------------------------------

// Knob profile in (t, h) edge-local coordinates: t along the edge 0..1,
// h outward. Heights are scaled so the knob head reaches exactly M.
type KnobSeg = { c1: [number, number]; c2: [number, number]; end: [number, number] };
interface KnobProfile {
  start: number;
  segs: KnobSeg[];
}

// Classic jigsaw knob: a narrow neck opening to a round head.
const JIGSAW_KNOB: KnobProfile = {
  start: 0.35,
  segs: [
    { c1: [0.47, 0], c2: [0.45, 0.33], end: [0.38, 0.45] },
    { c1: [0.29, 0.65], c2: [0.35, 1], end: [0.5, 1] },
    { c1: [0.65, 1], c2: [0.71, 0.65], end: [0.62, 0.45] },
    { c1: [0.55, 0.33], c2: [0.53, 0], end: [0.65, 0] },
  ],
};
// A wide, smooth dome (no neck).
const ROUND_KNOB: KnobProfile = {
  start: 0.28,
  segs: [
    { c1: [0.34, 0.62], c2: [0.36, 1], end: [0.5, 1] },
    { c1: [0.64, 1], c2: [0.66, 0.62], end: [0.72, 0] },
  ],
};

function knobFor(shape: string): KnobProfile {
  return shape === "interlock-round" ? ROUND_KNOB : JIGSAW_KNOB;
}

export function curvedPathD(
  edges: TileEdges,
  shape: string = "interlock-curved"
): string {
  const knob = knobFor(shape);
  const cmds: string[] = [`M ${round(M)} ${round(M)}`];
  (["top", "right", "bottom", "left"] as const).forEach((name) => {
    const frame = EDGE_FRAME[name];
    const kind = edges[name];
    if (kind === "flat") {
      cmds.push(`L ${round(frame.ex)} ${round(frame.ey)}`);
      return;
    }
    const sign = kind === "out" ? 1 : -1;
    const pt = (t: number, h: number) => {
      const [x, y] = edgePoint(frame, sign, t, h * M);
      return `${round(x)} ${round(y)}`;
    };
    cmds.push(`L ${pt(knob.start, 0)}`);
    for (const seg of knob.segs) {
      cmds.push(
        `C ${pt(seg.c1[0], seg.c1[1])}, ${pt(seg.c2[0], seg.c2[1])}, ${pt(seg.end[0], seg.end[1])}`
      );
    }
    cmds.push(`L ${round(frame.ex)} ${round(frame.ey)}`);
  });
  cmds.push("Z");
  return cmds.join(" ");
}

// True when a shape needs an SVG clipPath (curved family) rather than a CSS
// polygon (sharp family).
export function usesSvgClip(shape: string): boolean {
  return shape === "interlock-curved" || shape === "interlock-round";
}

// Every distinct edge combination a rows x cols board can produce, so the
// board can register one SVG clipPath per silhouette.
export function allEdgeCombos(rows: number, cols: number): TileEdges[] {
  const seen = new Map<string, TileEdges>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const edges = edgesFor(r, c, rows, cols);
      seen.set(edgesKey(edges), edges);
    }
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Puzzle-image slicing for the oversized interlocking boxes: tabs carry
// their slice of the image into the neighbour's notch.
// ---------------------------------------------------------------------------

export function interlockSliceStyle(
  row: number,
  col: number,
  rows: number,
  cols: number,
  imageUrl: string
): React.CSSProperties {
  const sizeX = (cols / (1 + 2 * TAB)) * 100;
  const sizeY = (rows / (1 + 2 * TAB)) * 100;
  const posX =
    cols - 1 - 2 * TAB !== 0 ? ((col - TAB) / (cols - 1 - 2 * TAB)) * 100 : 0;
  const posY =
    rows - 1 - 2 * TAB !== 0 ? ((row - TAB) / (rows - 1 - 2 * TAB)) * 100 : 0;
  return {
    backgroundImage: `url(${imageUrl})`,
    backgroundSize: `${sizeX}% ${sizeY}%`,
    backgroundPosition: `${posX}% ${posY}%`,
  };
}
