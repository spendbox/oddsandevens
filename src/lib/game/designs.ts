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
    body: ["#3a2f1c", "#1b1710"],
    metal: "#d8a44a",
    accent: "#f5c96b",
    frame: "#241d12",
  },
  vault: {
    key: "vault",
    name: "Vault",
    note: "Bank-grade steel. Nothing decorative about it.",
    body: ["#3d444c", "#181c21"],
    metal: "#a9b4c0",
    accent: "#e2e8f0",
    frame: "#20252b",
  },
  midnight: {
    key: "midnight",
    name: "Midnight",
    note: "Blue-black, and very quiet.",
    body: ["#1e2a51", "#0c1023"],
    metal: "#7d94d8",
    accent: "#a9beff",
    frame: "#141a33",
  },
  emerald: {
    key: "emerald",
    name: "Emerald",
    note: "Deep green with a hard shine.",
    body: ["#0f3f31", "#06170f"],
    metal: "#4fd1a1",
    accent: "#8ff0c8",
    frame: "#0a2419",
  },
  crimson: {
    key: "crimson",
    name: "Crimson",
    note: "For a box that means to be noticed.",
    body: ["#4a1420", "#1c0810"],
    metal: "#e06a80",
    accent: "#ff9db0",
    frame: "#2a0d16",
  },
  ivory: {
    key: "ivory",
    name: "Ivory",
    note: "Pale, plain, and the only light one.",
    body: ["#e8e3d8", "#b9b1a1"],
    metal: "#6b6255",
    accent: "#8b8071",
    frame: "#cdc6b8",
  },
};

export function isDesign(value: unknown): value is Design {
  return typeof value === "string" && (DESIGNS as readonly string[]).includes(value);
}

/** Whatever the database says, narrowed — an unknown design is just the default. */
export function toDesign(value: unknown): Design {
  return isDesign(value) ? value : DEFAULT_DESIGN;
}
