// The chase: terrain, damage, and what a shot did.
//
// The play screen is a pursuit seen from above — a car behind a runaway safe,
// both travelling, forever. Everything in here is the arithmetic that makes it
// mean something, kept out of the component so the component is only drawing.

/** How many crack stages a safe goes through before it gives. */
export const CRACKS = 10;

/** Cracks earned by a score. 20% is two, 100% is all ten and it bursts. */
export function cracksFor(percent: number): number {
  return Math.max(0, Math.min(CRACKS, Math.floor(percent / (100 / CRACKS))));
}

/**
 * What the last guess did to the safe.
 *
 * A hit is a guess that beat your own best — that is the only thing that adds
 * damage, so it is the only thing the gun should be allowed to land. A guess
 * that scores well but not better than one you have already made is a near
 * miss, and the shot goes wide. It looks like luck and it is actually the
 * truth: nothing changed.
 */
export type Shot = "hit" | "miss";

export interface ChaseTerrain {
  key: string;
  name: string;
  /** The ground either side of the road. */
  verge: [string, string];
  /** The road surface. */
  road: [string, string];
  /** Centre line and edge markings. */
  paint: string;
  /** Scenery scattered along the verge, drawn as a simple shape. */
  prop: "tree" | "cactus" | "rock" | "pine" | "palm" | "block";
  /** What the props are painted in. */
  propColour: [string, string];
}

/**
 * Five places to drive through, cycled on a timer.
 *
 * Not chosen at random per render — a chase that teleports between biomes reads
 * as a bug. They come round in order, crossfading, so a long session travels
 * somewhere.
 */
export const TERRAINS: ChaseTerrain[] = [
  {
    key: "dunes",
    name: "The dunes",
    verge: ["#f0c26a", "#c98f3a"],
    road: ["#4a4460", "#2e2a44"],
    paint: "#ffe9a8",
    prop: "cactus",
    propColour: ["#4ade9b", "#11855a"],
  },
  {
    key: "forest",
    name: "Deep forest",
    verge: ["#3f9d63", "#1d6b3f"],
    road: ["#43405c", "#28263c"],
    paint: "#fdf7ff",
    prop: "tree",
    propColour: ["#7ff0bb", "#0a6444"],
  },
  {
    key: "tundra",
    name: "The white",
    verge: ["#e8f2ff", "#a8c4e8"],
    road: ["#4d4a66", "#302d48"],
    paint: "#4cc9f0",
    prop: "pine",
    propColour: ["#8fd4c0", "#166b56"],
  },
  {
    key: "coast",
    name: "The coast road",
    verge: ["#7fdcd0", "#1f8f9c"],
    road: ["#4a4460", "#2e2a44"],
    paint: "#ffe9a8",
    prop: "palm",
    propColour: ["#66e2a0", "#0f7a52"],
  },
  {
    key: "city",
    name: "Downtown",
    verge: ["#4b3f77", "#241a49"],
    road: ["#3c3956", "#211f35"],
    paint: "#ffc247",
    prop: "block",
    propColour: ["#6f5fa8", "#2b2151"],
  },
];

/** How long the chase spends in one place, in milliseconds. */
export const TERRAIN_MS = 22_000;
