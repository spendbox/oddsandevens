// The game catalogue: one declarative entry per game a business can launch.
//
// Everything the platform needs to build, validate, render and explain a game
// lives here — the dashboard builder renders its editor straight from `fields`,
// the API validates against `engine`/`maxScore`, and the player page picks the
// component by `type`. Adding game #21 means adding an entry here plus one
// component in src/components/games.
//
// Keep this file free of React and of server-only imports: it is shared by the
// API routes, the dashboard, and the public player.

import type { GameConfig, GameEngine, GameTheme } from "./types";

export const GAME_TYPES = [
  "whack-a-mole",
  "slice-ninja",
  "flappy",
  "mahjong-3d",
  "match-3",
] as const;

export type GameType = (typeof GAME_TYPES)[number];

export const GAME_CATEGORIES = [
  {
    key: "arcade",
    label: "Arcade & reflex",
    blurb: "Fast, physical, one thumb. The top of the weekly board takes the prizes.",
  },
  {
    key: "puzzle",
    label: "Puzzle & match",
    blurb: "Slower, cleverer, just as competitive — a score you can chase all week.",
  },
] as const;

export type GameCategory = (typeof GAME_CATEGORIES)[number]["key"];

// ---------------------------------------------------------------------------
// Config field schema — the builder renders these generically.
// ---------------------------------------------------------------------------

export type ConfigFieldType =
  | "text"
  | "textarea"
  | "number"
  | "toggle"
  | "select"
  | "image"
  | "list"
  /** One emoji, chosen from a picker. */
  | "emoji"
  /** Several emoji, chosen from a picker; stored space-separated. */
  | "emoji-set";

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  help?: string;
  /** emoji-set only: how many may be chosen. */
  maxPicks?: number;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  options?: { value: string; label: string }[];
  // type: "list" only
  fields?: ConfigField[];
  itemNoun?: string;
  minItems?: number;
  maxItems?: number;
  /** Template for a fresh list row — an object, or a string for scalar lists. */
  newItem?: unknown;
}

export interface GameDefinition {
  type: GameType;
  label: string;
  /** One line on the gallery card. */
  tagline: string;
  /** The pitch in the builder: what it does for the business. */
  blurb: string;
  category: GameCategory;
  engine: GameEngine;
  /** lucide-react icon name, resolved client-side in components/games/icons.ts */
  icon: string;
  /** Two-stop gradient for the gallery card. */
  swatch: [string, string];
  /** Default replay cooldown in hours (0 = replay freely). */
  cooldownHours: number;
  /** Server-side clamp on a submitted score. */
  maxScore: number;
  /** Score games only: is a high-score table meaningful? */
  hasLeaderboard: boolean;
  /**
   * Can this game carry a weekly leaderboard competition? Only competitive
   * games are offered in the builder — the rest stay in the codebase so games
   * already published keep working, but nobody can create a new one.
   */
  competitive: boolean;
  /** How the score reads to a human ("points", "correct answers"…). */
  scoreLabel: string;
  /**
   * How prizes are configured:
   *   "draw"   — chance games: each prize is a segment with a weight.
   *   "target" — score games: each prize has a score to beat.
   *   "finish" — everyone who completes it wins (target 0), e.g. a quiz result.
   */
  winRule: "draw" | "target" | "finish";
  /** Suggested target score for the first prize of a "target" game. */
  defaultTarget: number;
  /** Does this game type need losing segments to feel fair? */
  usesBlanks: boolean;
  defaultConfig: GameConfig;
  fields: ConfigField[];
}

// Shared field builders ------------------------------------------------------

const durationField = (def = 45): ConfigField => ({
  key: "duration",
  label: "Round length (seconds)",
  type: "number",
  min: 15,
  max: 180,
  help: `How long one round lasts. ${def}s keeps it snackable.`,
});

const difficultyField: ConfigField = {
  key: "difficulty",
  label: "Difficulty",
  type: "select",
  options: [
    { value: "easy", label: "Easy — most people win" },
    { value: "normal", label: "Normal" },
    { value: "hard", label: "Hard — bragging rights" },
  ],
};

/** One emoji, from the picker. */
const emojiField = (key: string, label: string, help: string): ConfigField => ({
  key,
  label,
  type: "emoji",
  help,
  maxLength: 8,
});

/** A handful of emoji, from the picker; stored space-separated. */
const emojiSetField = (
  key: string,
  label: string,
  help: string,
  maxPicks = 5
): ConfigField => ({
  key,
  label,
  type: "emoji-set",
  help,
  maxPicks,
  maxLength: 60,
});

// Arcade games are much friendlier with a few lives: one mistake ending the
// whole round is the fastest way to make a player close the tab.
const livesField: ConfigField = {
  key: "lives",
  label: "Lives per round",
  type: "number",
  min: 1,
  max: 9,
  help: "How many mistakes a player gets before the round ends.",
};

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

export const GAMES: Record<GameType, GameDefinition> = {

  "slice-ninja": {
    type: "slice-ninja",
    label: "Slice Ninja",
    tagline: "Swipe through the fruit, miss the bombs.",
    blurb:
      "Fast, tactile, and instantly understood. Swap the fruit for your menu items and it becomes an ad people replay on purpose.",
    category: "arcade",
    engine: "score",
    icon: "sword",
    swatch: ["#e11d48", "#f59e0b"],
    cooldownHours: 6,
    maxScore: 100000,
    hasLeaderboard: true,
    competitive: true,
    scoreLabel: "points",
    winRule: "target",
    defaultTarget: 20,
    usesBlanks: false,
    defaultConfig: {
      duration: 45,
      sliceEmojis: "🍉 🍊 🍏 🍍",
      bombEmoji: "💣",
      difficulty: "normal",
      lives: 3,
    },
    fields: [
      durationField(45),
      emojiSetField("sliceEmojis", "Things to slice", "Space-separated emoji."),
      emojiField("bombEmoji", "Bomb", "Slicing one costs a life."),
      livesField,
      difficultyField,
    ],
  },

  "whack-a-mole": {
    type: "whack-a-mole",
    label: "Whack-a-Mole",
    tagline: "Tap what pops up. Don't tap the wrong thing.",
    blurb:
      "The most forgiving arcade game there is — everyone gets it in one second. Swap the mole for anything you want people to associate with a reflex.",
    category: "arcade",
    engine: "score",
    icon: "hammer",
    swatch: ["#a16207", "#16a34a"],
    cooldownHours: 6,
    maxScore: 100000,
    hasLeaderboard: true,
    competitive: true,
    scoreLabel: "points",
    winRule: "target",
    defaultTarget: 20,
    usesBlanks: false,
    defaultConfig: {
      duration: 40,
      holes: 9,
      targetEmoji: "🐹",
      decoyEmoji: "💣",
      difficulty: "normal",
    },
    fields: [
      durationField(40),
      {
        key: "holes",
        label: "Holes",
        type: "select",
        options: [
          { value: "6", label: "6 (2 × 3)" },
          { value: "9", label: "9 (3 × 3)" },
          { value: "12", label: "12 (3 × 4)" },
        ],
      },
      emojiField("targetEmoji", "Hit this", "Worth points."),
      emojiField("decoyEmoji", "Avoid this", "Costs points."),
      difficultyField,
    ],
  },

  flappy: {
    type: "flappy",
    label: "Flappy Flyer",
    tagline: "Tap to fly. Mind the gap.",
    blurb:
      "Infuriating in the best way. One tap, instant restarts, and a score people refuse to leave alone.",
    category: "arcade",
    engine: "score",
    icon: "bird",
    swatch: ["#0ea5e9", "#84cc16"],
    cooldownHours: 6,
    maxScore: 100000,
    hasLeaderboard: true,
    competitive: true,
    scoreLabel: "gates",
    winRule: "target",
    defaultTarget: 8,
    usesBlanks: false,
    defaultConfig: {
      flyerEmoji: "🐤",
      pipeColor: "#16a34a",
      difficulty: "normal",
      lives: 3,
    },
    fields: [
      emojiField("flyerEmoji", "The flyer", "Your mascot, an emoji."),
      { key: "pipeColor", label: "Pipe colour", type: "text", maxLength: 7 },
      livesField,
      difficultyField,
    ],
  },
  "mahjong-3d": {
    type: "mahjong-3d",
    label: "3D Mahjong",
    tagline: "Clear the stack, pair by pair.",
    blurb:
      "Tiles piled in layers, lit and shaded so the stack reads as solid. Match free pairs to peel it away — calm to look at, ruthless against a clock, and every tile face is something you sell.",
    category: "puzzle",
    engine: "score",
    icon: "layers",
    swatch: ["#0f766e", "#f59e0b"],
    cooldownHours: 0,
    maxScore: 100000,
    hasLeaderboard: true,
    competitive: true,
    scoreLabel: "points",
    winRule: "target",
    defaultTarget: 800,
    usesBlanks: false,
    defaultConfig: {
      faces: "🍕 🍔 🌮 🍜 🍩 ☕ 🥗 🍣",
      layout: "pyramid",
      timeLimit: 120,
    },
    fields: [
      emojiSetField(
        "faces",
        "Tile faces",
        "What is printed on the tiles — your products work best.",
        8
      ),
      {
        key: "layout",
        label: "Stack",
        type: "select",
        options: [
          { value: "pyramid", label: "Pyramid — 3 layers, quick" },
          { value: "tower", label: "Tower — 4 layers, tougher" },
        ],
      },
      {
        key: "timeLimit",
        label: "Time limit (seconds)",
        type: "number",
        min: 45,
        max: 300,
        help: "Clearing the stack early pays the rest of the clock.",
      },
    ],
  },

  "match-3": {
    type: "match-3",
    label: "Match Three",
    tagline: "Swap, match, watch it cascade.",
    blurb:
      "The one everybody already knows how to play. Glossy jewels in your colours, chain reactions worth more than single matches, and a move budget that makes every swap a decision.",
    category: "puzzle",
    engine: "score",
    icon: "gem",
    swatch: ["#db2777", "#7c3aed"],
    cooldownHours: 0,
    maxScore: 1000000,
    hasLeaderboard: true,
    competitive: true,
    scoreLabel: "points",
    winRule: "target",
    defaultTarget: 2000,
    usesBlanks: false,
    defaultConfig: {
      moves: 25,
      size: 7,
      pieces: 5,
    },
    fields: [
      {
        key: "moves",
        label: "Moves per round",
        type: "number",
        min: 10,
        max: 60,
        help: "The budget every player gets. Fewer moves, sharper board.",
      },
      {
        key: "size",
        label: "Board size",
        type: "select",
        options: [
          { value: "6", label: "6 × 6 — roomy" },
          { value: "7", label: "7 × 7" },
          { value: "8", label: "8 × 8 — busy" },
        ],
      },
      {
        key: "pieces",
        label: "How many jewel types",
        type: "select",
        options: [
          { value: "4", label: "4 — easier matches" },
          { value: "5", label: "5" },
          { value: "6", label: "6 — harder" },
        ],
      },
    ],
  },

};

export const GAME_LIST: GameDefinition[] = GAME_TYPES.map((t) => GAMES[t]);

/**
 * The games a business can actually launch: ones that can carry a weekly
 * leaderboard. The rest stay in the codebase so anything already published
 * keeps running, but they are never offered again.
 */
export const COMPETITIVE_GAMES: GameDefinition[] = GAME_LIST.filter(
  (g) => g.competitive
);

/** Only the categories that still have games in them. */
export function competitiveCategories() {
  return GAME_CATEGORIES.filter((c) =>
    COMPETITIVE_GAMES.some((g) => g.category === c.key)
  );
}

export function isGameType(value: string): value is GameType {
  return (GAME_TYPES as readonly string[]).includes(value);
}

export function gameDef(type: string): GameDefinition | null {
  return isGameType(type) ? GAMES[type] : null;
}

export function gamesInCategory(category: GameCategory): GameDefinition[] {
  return COMPETITIVE_GAMES.filter((g) => g.category === category);
}

// ---------------------------------------------------------------------------
// Tier caps for games (mirrored in create_game).
// ---------------------------------------------------------------------------

export const GAME_TIER_LIMITS = {
  free: { maxGames: 2, maxPrizes: 2 },
  premium: { maxGames: Number.POSITIVE_INFINITY, maxPrizes: 10 },
} as const;

// Total slots (prizes + blanks) any single game may carry.
export const MAX_PRIZE_SLOTS = 24;

// ---------------------------------------------------------------------------
// Weekly competition defaults (mirrored in create_game).
// ---------------------------------------------------------------------------

/** How long a leaderboard runs before the prizes go out and it resets. */
export const DEFAULT_SEASON_DAYS = 7;
/** Plays per player per day. */
export const DEFAULT_DAILY_LIVES = 3;
/** Extra plays a player can earn in a day by sharing their link. */
export const DEFAULT_MAX_BONUS_LIVES = 3;

/** "1st place", "2nd place"… for the prize rows and the board. */
export function rankLabel(rank: number): string {
  const suffix =
    rank % 100 >= 11 && rank % 100 <= 13
      ? "th"
      : rank % 10 === 1
        ? "st"
        : rank % 10 === 2
          ? "nd"
          : rank % 10 === 3
            ? "rd"
            : "th";
  return `${rank}${suffix} place`;
}

export const RANK_MEDALS = ["🥇", "🥈", "🥉"] as const;

// ---------------------------------------------------------------------------
// Config helpers used by both the builder and the players.
// ---------------------------------------------------------------------------

export function configString(config: GameConfig, key: string, fallback = ""): string {
  const v = config?.[key];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

export function configNumber(config: GameConfig, key: string, fallback: number): number {
  const v = config?.[key];
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export function configBool(config: GameConfig, key: string, fallback: boolean): boolean {
  const v = config?.[key];
  return typeof v === "boolean" ? v : fallback;
}

export function configList<T>(config: GameConfig, key: string, fallback: T[]): T[] {
  const v = config?.[key];
  return Array.isArray(v) && v.length > 0 ? (v as T[]) : fallback;
}

// "🍕 🍔 🥤" -> ["🍕", "🍔", "🥤"]. Emoji are authored as one text field
// because a list editor for three characters is worse than a space.
export function emojiList(value: string, fallback: string[]): string[] {
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts : fallback;
}

// Difficulty knob shared by the arcade games.
export function difficultyScale(config: GameConfig): number {
  switch (configString(config, "difficulty", "normal")) {
    case "easy":
      return 0.75;
    case "hard":
      return 1.35;
    default:
      return 1;
  }
}

export function themeAccent(theme: GameTheme | null | undefined, brand: string): string {
  const accent = theme?.accent;
  return typeof accent === "string" && /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : brand;
}

// Slugify a game title into a URL segment the SQL check constraint accepts
// (3–40 chars, alphanumeric with inner hyphens). Very short titles keep their
// words and get a "-game" suffix rather than being replaced wholesale.
export function slugifyGameTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  if (base.length >= 3) return base;
  if (base.length > 0) return `${base}-game`;
  return `game-${Math.random().toString(36).slice(2, 8)}`;
}
