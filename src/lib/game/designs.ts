// The safe a box wears.
//
// Purely cosmetic — nothing here touches a rule, a price or a score. It exists
// because a contributor putting a million naira behind a password is making
// something, and everything they make otherwise looks identical to everything
// everyone else made.
//
// Each design is a small palette rather than an image: the safe is drawn in
// SVG at whatever size it's needed, so a box on a card and the same box filling
// a play screen are the same object and neither is a download.
//
// The six are *bright*. They started dark and tasteful — near-black bodies with
// a metal trim — and on a lobby of thirty cards they were thirty dark squares.
// A player picking a safe is picking a toy, so the bodies are the colour and
// the ink outline does the work the darkness used to.

export const DESIGNS = [
  "brass",
  "vault",
  "midnight",
  "emerald",
  "crimson",
  "ivory",
] as const;

export type Design = (typeof DESIGNS)[number];

export const DEFAULT_DESIGN: Design = "brass";

export interface DesignSpec {
  key: Design;
  name: string;
  /** One line, for the chooser. */
  note: string;
  /** Door face, from the top-left to the bottom-right of the gradient. */
  body: [string, string];
  /** The dial, the bolts, the trim. */
  metal: string;
  /** The glow behind it and the highlight on it. */
  accent: string;
  /** The plate the door sits in. */
  frame: string;
}

export const DESIGN_SPECS: Record<Design, DesignSpec> = {
  brass: {
    key: "brass",
    name: "Brass",
    note: "Warm, old, and heavier than it looks.",
    body: ["#ffd76e", "#d18a1a"],
    metal: "#fff3d1",
    accent: "#ffe9a8",
    frame: "#8f5b0c",
  },
  vault: {
    key: "vault",
    name: "Vault",
    note: "Bank-grade steel. Nothing decorative about it.",
    body: ["#dbe4f0", "#8b9bb4"],
    metal: "#ffffff",
    accent: "#f2f7ff",
    frame: "#54627a",
  },
  midnight: {
    key: "midnight",
    name: "Midnight",
    note: "Blue-black, and very quiet.",
    body: ["#7fb2ff", "#2a53c0"],
    metal: "#d6e6ff",
    accent: "#b8d6ff",
    frame: "#1b3480",
  },
  emerald: {
    key: "emerald",
    name: "Emerald",
    note: "Deep green with a hard shine.",
    body: ["#7ff0bb", "#11a06a"],
    metal: "#d8fff0",
    accent: "#b0ffdb",
    frame: "#0a6444",
  },
  crimson: {
    key: "crimson",
    name: "Crimson",
    note: "For a box that means to be noticed.",
    body: ["#ff9ab8", "#e0325f"],
    metal: "#ffe1ea",
    accent: "#ffc2d4",
    frame: "#96153c",
  },
  ivory: {
    key: "ivory",
    name: "Ivory",
    note: "Pale, plain, and the calmest of the six.",
    body: ["#fff6e4", "#d9c7a6"],
    metal: "#ffffff",
    accent: "#fffaf0",
    frame: "#9a8564",
  },
};

export function isDesign(value: unknown): value is Design {
  return typeof value === "string" && (DESIGNS as readonly string[]).includes(value);
}

/** Whatever the database says, narrowed — an unknown design is just the default. */
export function toDesign(value: unknown): Design {
  return isDesign(value) ? value : DEFAULT_DESIGN;
}
