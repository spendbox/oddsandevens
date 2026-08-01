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
  "spin-wheel",
  "scratch-card",
  "mystery-box",
  "advent-calendar",
  "endless-runner",
  "falling-catcher",
  "slice-ninja",
  "tile-merge",
  "recommender-quiz",
  "myth-fact",
  "memory-match",
  "lookbook",
  "leaderboard-trivia",
  "scavenger-hunt",
  "bracket-poll",
  "whack-a-mole",
  "flappy",
  "jigsaw",
  "spot-difference",
  "tic-tac-toe",
] as const;

export type GameType = (typeof GAME_TYPES)[number];

export const GAME_CATEGORIES = [
  { key: "instant-win", label: "Instant win", blurb: "Tap, reveal, walk away with a code." },
  { key: "arcade", label: "Arcade & skill", blurb: "Play for a high score, win at a target." },
  { key: "quiz", label: "Quiz & discover", blurb: "Teach, recommend, and capture interest." },
  { key: "community", label: "Community", blurb: "Get people voting, hunting, and coming back." },
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
  | "list";

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  help?: string;
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

const emojiListField = (
  key: string,
  label: string,
  help: string
): ConfigField => ({
  key,
  label,
  type: "text",
  help,
  maxLength: 60,
});

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

export const GAMES: Record<GameType, GameDefinition> = {
  "spin-wheel": {
    type: "spin-wheel",
    label: "Wheel of Fortune",
    tagline: "Spin to win — the classic.",
    blurb:
      "One tap, one spin, one prize. The odds live on the server, so the wheel only ever animates to a result it was told. Perfect for launches and footfall.",
    category: "instant-win",
    engine: "chance",
    icon: "disc",
    swatch: ["#f97316", "#db2777"],
    cooldownHours: 24,
    maxScore: 1,
    hasLeaderboard: false,
    scoreLabel: "spins",
    winRule: "draw",
    defaultTarget: 0,
    usesBlanks: true,
    defaultConfig: { spinLabel: "SPIN", hubLabel: "" },
    fields: [
      {
        key: "spinLabel",
        label: "Button text",
        type: "text",
        maxLength: 16,
        placeholder: "SPIN",
      },
      {
        key: "hubLabel",
        label: "Text in the middle of the wheel",
        type: "text",
        maxLength: 20,
        placeholder: "Your logo shows here if empty",
      },
    ],
  },

  "scratch-card": {
    type: "scratch-card",
    label: "Digital Scratch Card",
    tagline: "Scratch the foil, reveal the prize.",
    blurb:
      "A satisfying finger-scratch that reveals what the server already decided. Great on receipts, table tents, and delivery-bag stickers.",
    category: "instant-win",
    engine: "chance",
    icon: "coins",
    swatch: ["#6366f1", "#0ea5e9"],
    cooldownHours: 24,
    maxScore: 1,
    hasLeaderboard: false,
    scoreLabel: "cards",
    winRule: "draw",
    defaultTarget: 0,
    usesBlanks: true,
    defaultConfig: { coverText: "Scratch here", brushSize: 26, revealPercent: 45 },
    fields: [
      { key: "coverText", label: "Text on the foil", type: "text", maxLength: 24 },
      {
        key: "brushSize",
        label: "Scratch brush size",
        type: "number",
        min: 12,
        max: 60,
      },
      {
        key: "revealPercent",
        label: "Reveal at (% scratched)",
        type: "number",
        min: 20,
        max: 90,
        help: "How much foil has to go before the prize pops.",
      },
    ],
  },

  "mystery-box": {
    type: "mystery-box",
    label: "Mystery Gift / Pick-a-Box",
    tagline: "Three boxes. One choice. No takebacks.",
    blurb:
      "The simplest possible game: pick a box, open it. Reads as generous even when most boxes are thank-yous, because the choice feels like the player's.",
    category: "instant-win",
    engine: "chance",
    icon: "gift",
    swatch: ["#a855f7", "#ec4899"],
    cooldownHours: 24,
    maxScore: 1,
    hasLeaderboard: false,
    scoreLabel: "picks",
    winRule: "draw",
    defaultTarget: 0,
    usesBlanks: true,
    defaultConfig: { boxCount: 3, boxEmoji: "🎁", prompt: "Pick a box" },
    fields: [
      { key: "prompt", label: "Prompt", type: "text", maxLength: 40 },
      { key: "boxCount", label: "How many boxes", type: "number", min: 2, max: 9 },
      emojiListField("boxEmoji", "Box emoji", "Shown on every closed box."),
    ],
  },

  "advent-calendar": {
    type: "advent-calendar",
    label: "Interactive Advent Calendar",
    tagline: "One door a day, all season long.",
    blurb:
      "A returning-visit machine: doors unlock on their day, and each opening draws from your prize pool. Works for Christmas, Ramadan, an anniversary week, or a 12-day launch.",
    category: "instant-win",
    engine: "chance",
    icon: "calendar-days",
    swatch: ["#dc2626", "#15803d"],
    cooldownHours: 20,
    maxScore: 1,
    hasLeaderboard: false,
    scoreLabel: "doors",
    winRule: "draw",
    defaultTarget: 0,
    usesBlanks: true,
    defaultConfig: {
      doors: 12,
      startDate: "",
      lockFutureDoors: true,
      doorEmoji: "🎄",
    },
    fields: [
      { key: "doors", label: "How many doors", type: "number", min: 4, max: 31 },
      {
        key: "startDate",
        label: "First door opens on",
        type: "text",
        placeholder: "YYYY-MM-DD",
        help: "Door 1 unlocks that day, door 2 the next, and so on. Leave empty to unlock every door immediately.",
      },
      {
        key: "lockFutureDoors",
        label: "Lock doors until their day",
        type: "toggle",
      },
      emojiListField("doorEmoji", "Door emoji", "Decorates each closed door."),
    ],
  },

  "endless-runner": {
    type: "endless-runner",
    label: "Endless Runner",
    tagline: "Jump the obstacles, bank the distance.",
    blurb:
      "A one-button runner branded with your mascot. Players chase a target score for the prize — and the leaderboard keeps them chasing after that.",
    category: "arcade",
    engine: "score",
    icon: "footprints",
    swatch: ["#0891b2", "#4f46e5"],
    cooldownHours: 6,
    maxScore: 100000,
    hasLeaderboard: true,
    scoreLabel: "metres",
    winRule: "target",
    defaultTarget: 300,
    usesBlanks: false,
    defaultConfig: {
      runnerEmoji: "🏃",
      obstacleEmoji: "🌵",
      difficulty: "normal",
      groundColor: "#1f2937",
    },
    fields: [
      emojiListField("runnerEmoji", "Runner", "Your mascot, an emoji."),
      emojiListField("obstacleEmoji", "Obstacle", "What they jump over."),
      difficultyField,
    ],
  },

  "falling-catcher": {
    type: "falling-catcher",
    label: "Falling Objects / Catcher",
    tagline: "Catch the good stuff, dodge the rest.",
    blurb:
      "Products rain down; the player catches them in your basket. Dead simple on a phone, and the good/bad items are yours to brand.",
    category: "arcade",
    engine: "score",
    icon: "shopping-basket",
    swatch: ["#16a34a", "#65a30d"],
    cooldownHours: 6,
    maxScore: 100000,
    hasLeaderboard: true,
    scoreLabel: "points",
    winRule: "target",
    defaultTarget: 25,
    usesBlanks: false,
    defaultConfig: {
      duration: 45,
      goodEmojis: "🍕 🍔 🥤",
      badEmojis: "💣",
      catcherEmoji: "🧺",
      difficulty: "normal",
    },
    fields: [
      durationField(45),
      emojiListField("goodEmojis", "Things to catch", "Space-separated emoji."),
      emojiListField("badEmojis", "Things to dodge", "Catching one costs a life."),
      emojiListField("catcherEmoji", "The basket", "What the player moves."),
      difficultyField,
    ],
  },

  "slice-ninja": {
    type: "slice-ninja",
    label: "Slice / Ninja Chop",
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
    scoreLabel: "points",
    winRule: "target",
    defaultTarget: 20,
    usesBlanks: false,
    defaultConfig: {
      duration: 45,
      sliceEmojis: "🍉 🍊 🍏 🍍",
      bombEmoji: "💣",
      difficulty: "normal",
    },
    fields: [
      durationField(45),
      emojiListField("sliceEmojis", "Things to slice", "Space-separated emoji."),
      emojiListField("bombEmoji", "Bomb", "Slicing one ends the round."),
      difficultyField,
    ],
  },

  "tile-merge": {
    type: "tile-merge",
    label: "Tile Merge",
    tagline: "Swipe, merge, climb the ladder.",
    blurb:
      "The 2048 loop with your product tiers as tiles. Long sessions, high replay, and a natural target: reach the top tile to win.",
    category: "arcade",
    engine: "score",
    icon: "grid-2x2",
    swatch: ["#f59e0b", "#dc2626"],
    cooldownHours: 6,
    maxScore: 100000,
    hasLeaderboard: true,
    scoreLabel: "points",
    winRule: "target",
    defaultTarget: 400,
    usesBlanks: false,
    defaultConfig: { size: 4, tileWords: "" },
    fields: [
      {
        key: "size",
        label: "Board size",
        type: "select",
        options: [
          { value: "4", label: "4 × 4 (classic)" },
          { value: "5", label: "5 × 5 (easier)" },
        ],
      },
      {
        key: "tileWords",
        label: "Tile names (optional)",
        type: "text",
        maxLength: 120,
        help: "Comma-separated, smallest first — e.g. Espresso, Latte, Mocha. Numbers are used if empty.",
      },
    ],
  },

  "recommender-quiz": {
    type: "recommender-quiz",
    label: "Product Recommender Quiz",
    tagline: "Four questions to their perfect order.",
    blurb:
      "Every answer scores a product; the last screen names the winner and links straight to it. The highest-intent game in the catalogue — and everyone finishes it, so everyone can be rewarded.",
    category: "quiz",
    engine: "score",
    icon: "sparkles",
    swatch: ["#7c3aed", "#2563eb"],
    cooldownHours: 12,
    maxScore: 100,
    hasLeaderboard: false,
    scoreLabel: "answers",
    winRule: "finish",
    defaultTarget: 0,
    usesBlanks: false,
    defaultConfig: {
      intro: "Answer 3 quick questions and we'll pick your match.",
      outcomes: [
        { key: "a", title: "The Classic", blurb: "Our best-seller, never wrong.", linkUrl: "" },
        { key: "b", title: "The Adventurer", blurb: "For when you want something new.", linkUrl: "" },
      ],
      questions: [
        {
          prompt: "How are you feeling today?",
          options: [
            { label: "Play it safe", outcome: "a" },
            { label: "Surprise me", outcome: "b" },
          ],
        },
        {
          prompt: "Pick a vibe",
          options: [
            { label: "Cosy and familiar", outcome: "a" },
            { label: "Bold and loud", outcome: "b" },
          ],
        },
      ],
    },
    fields: [
      { key: "intro", label: "Intro line", type: "textarea", maxLength: 200 },
      {
        key: "outcomes",
        label: "Possible results",
        type: "list",
        itemNoun: "result",
        minItems: 2,
        maxItems: 8,
        newItem: { key: "", title: "", blurb: "", linkUrl: "" },
        help: "Give each result a short key (a, b, c…) — answers point at these keys.",
        fields: [
          { key: "key", label: "Key", type: "text", maxLength: 12 },
          { key: "title", label: "Result name", type: "text", maxLength: 60 },
          { key: "blurb", label: "Why it fits", type: "textarea", maxLength: 200 },
          { key: "linkUrl", label: "Link (optional)", type: "text", maxLength: 300 },
        ],
      },
      {
        key: "questions",
        label: "Questions",
        type: "list",
        itemNoun: "question",
        minItems: 1,
        maxItems: 10,
        newItem: { prompt: "", options: [{ label: "", outcome: "" }] },
        fields: [
          { key: "prompt", label: "Question", type: "text", maxLength: 140 },
          {
            key: "options",
            label: "Answers",
            type: "list",
            itemNoun: "answer",
            minItems: 2,
            maxItems: 6,
            newItem: { label: "", outcome: "" },
            fields: [
              { key: "label", label: "Answer", type: "text", maxLength: 80 },
              { key: "outcome", label: "Scores for (key)", type: "text", maxLength: 12 },
            ],
          },
        ],
      },
    ],
  },

  "myth-fact": {
    type: "myth-fact",
    label: "Myth vs. Fact Trivia",
    tagline: "Bust the myths in your industry.",
    blurb:
      "Two buttons, a stack of statements, and an explanation after each one. The cheapest way to teach customers something true about what you sell.",
    category: "quiz",
    engine: "score",
    icon: "scale",
    swatch: ["#0d9488", "#7c3aed"],
    cooldownHours: 12,
    maxScore: 100,
    hasLeaderboard: true,
    scoreLabel: "correct",
    winRule: "target",
    defaultTarget: 3,
    usesBlanks: false,
    defaultConfig: {
      statements: [
        {
          text: "Jollof rice tastes better the next day.",
          isFact: true,
          explanation: "The flavours keep settling overnight — science, mostly.",
        },
        {
          text: "Spicy food ruins your taste buds forever.",
          isFact: false,
          explanation: "It's a temporary numbing at worst. Your buds bounce back.",
        },
        {
          text: "Cold drinks slow down digestion.",
          isFact: false,
          explanation: "A myth. Your body warms what you drink almost instantly.",
        },
      ],
    },
    fields: [
      {
        key: "statements",
        label: "Statements",
        type: "list",
        itemNoun: "statement",
        minItems: 2,
        maxItems: 20,
        newItem: { text: "", isFact: true, explanation: "" },
        fields: [
          { key: "text", label: "Statement", type: "textarea", maxLength: 200 },
          { key: "isFact", label: "This one is a FACT", type: "toggle" },
          { key: "explanation", label: "Explain it", type: "textarea", maxLength: 240 },
        ],
      },
    ],
  },

  "memory-match": {
    type: "memory-match",
    label: "Memory Card Match",
    tagline: "Flip, remember, clear the board.",
    blurb:
      "Your products, face down. Clearing the board fast is the game; every flip is another look at what you sell.",
    category: "arcade",
    engine: "score",
    icon: "layout-grid",
    swatch: ["#2563eb", "#0891b2"],
    cooldownHours: 6,
    maxScore: 10000,
    hasLeaderboard: true,
    scoreLabel: "points",
    winRule: "target",
    defaultTarget: 500,
    usesBlanks: false,
    defaultConfig: { pairs: 6, faces: "🍕 🍔 🌮 🍜 🍩 ☕ 🥗 🍣", timeLimit: 90 },
    fields: [
      { key: "pairs", label: "How many pairs", type: "number", min: 3, max: 10 },
      emojiListField("faces", "Card faces", "Space-separated emoji — one per pair."),
      {
        key: "timeLimit",
        label: "Time limit (seconds)",
        type: "number",
        min: 30,
        max: 300,
        help: "Finishing faster scores higher.",
      },
    ],
  },

  lookbook: {
    type: "lookbook",
    label: "Virtual Lookbook / Room Builder",
    tagline: "Let them style it before they buy it.",
    blurb:
      "Players mix and match your pieces into one look, then keep it. A soft-sell configurator that doubles as a game — everyone who finishes can be rewarded.",
    category: "quiz",
    engine: "score",
    icon: "shirt",
    swatch: ["#db2777", "#f59e0b"],
    cooldownHours: 12,
    maxScore: 100,
    hasLeaderboard: false,
    scoreLabel: "looks",
    winRule: "finish",
    defaultTarget: 0,
    usesBlanks: false,
    defaultConfig: {
      finishLabel: "That's my look",
      slots: [
        {
          name: "Top",
          options: [
            { label: "Linen shirt", emoji: "👔", imageUrl: "" },
            { label: "Graphic tee", emoji: "👕", imageUrl: "" },
          ],
        },
        {
          name: "Bottom",
          options: [
            { label: "Wide jeans", emoji: "👖", imageUrl: "" },
            { label: "Pleated skirt", emoji: "🩳", imageUrl: "" },
          ],
        },
      ],
    },
    fields: [
      { key: "finishLabel", label: "Finish button", type: "text", maxLength: 30 },
      {
        key: "slots",
        label: "Layers",
        type: "list",
        itemNoun: "layer",
        minItems: 1,
        maxItems: 6,
        newItem: { name: "", options: [{ label: "", emoji: "", imageUrl: "" }] },
        fields: [
          { key: "name", label: "Layer name", type: "text", maxLength: 40 },
          {
            key: "options",
            label: "Choices",
            type: "list",
            itemNoun: "choice",
            minItems: 1,
            maxItems: 8,
            newItem: { label: "", emoji: "", imageUrl: "" },
            fields: [
              { key: "label", label: "Name", type: "text", maxLength: 60 },
              { key: "emoji", label: "Emoji", type: "text", maxLength: 8 },
              { key: "imageUrl", label: "Image URL (optional)", type: "image" },
            ],
          },
        ],
      },
    ],
  },

  "leaderboard-trivia": {
    type: "leaderboard-trivia",
    label: "Live Leaderboard Trivia",
    tagline: "Answer fast, climb the board.",
    blurb:
      "Timed multiple choice where speed is worth points. The live leaderboard turns a quiz into a competition people share.",
    category: "quiz",
    engine: "score",
    icon: "trophy",
    swatch: ["#f59e0b", "#7c3aed"],
    cooldownHours: 12,
    maxScore: 100000,
    hasLeaderboard: true,
    scoreLabel: "points",
    winRule: "target",
    defaultTarget: 300,
    usesBlanks: false,
    defaultConfig: {
      secondsPerQuestion: 15,
      questions: [
        {
          prompt: "What year did we open?",
          options: ["2016", "2019", "2021", "2023"],
          answerIndex: 1,
        },
        {
          prompt: "Which dish is our best-seller?",
          options: ["Jollof", "Suya wrap", "Pepper soup", "Puff-puff"],
          answerIndex: 0,
        },
      ],
    },
    fields: [
      {
        key: "secondsPerQuestion",
        label: "Seconds per question",
        type: "number",
        min: 5,
        max: 60,
        help: "Answering with time left on the clock scores bonus points.",
      },
      {
        key: "questions",
        label: "Questions",
        type: "list",
        itemNoun: "question",
        minItems: 1,
        maxItems: 20,
        newItem: { prompt: "", options: ["", "", "", ""], answerIndex: 0 },
        fields: [
          { key: "prompt", label: "Question", type: "text", maxLength: 160 },
          {
            key: "options",
            label: "Options",
            type: "list",
            itemNoun: "option",
            minItems: 2,
            maxItems: 6,
            newItem: "",
          },
          {
            key: "answerIndex",
            label: "Correct option (1 = first)",
            type: "number",
            min: 1,
            max: 6,
          },
        ],
      },
    ],
  },

  "scavenger-hunt": {
    type: "scavenger-hunt",
    label: "Digital Scavenger Hunt",
    tagline: "Clues in the wild, codes on the phone.",
    blurb:
      "Hide codes on posters, packaging, stories, or around the shop. Players collect them all to win — the only game here that gets people physically moving.",
    category: "community",
    engine: "score",
    icon: "map-pin",
    swatch: ["#059669", "#0891b2"],
    cooldownHours: 0,
    maxScore: 100,
    hasLeaderboard: false,
    scoreLabel: "clues found",
    winRule: "target",
    defaultTarget: 3,
    usesBlanks: false,
    defaultConfig: {
      intro: "Find the codes hidden around us and type them in.",
      stops: [
        { hint: "On the poster by the till", code: "TILL01" },
        { hint: "In our Instagram story today", code: "STORY2" },
        { hint: "On the bottom of your receipt", code: "THANKS" },
      ],
    },
    fields: [
      { key: "intro", label: "Intro line", type: "textarea", maxLength: 200 },
      {
        key: "stops",
        label: "Clues",
        type: "list",
        itemNoun: "clue",
        minItems: 1,
        maxItems: 12,
        newItem: { hint: "", code: "" },
        fields: [
          { key: "hint", label: "Where to look", type: "text", maxLength: 140 },
          { key: "code", label: "Code to type", type: "text", maxLength: 24 },
        ],
      },
    ],
  },

  "bracket-poll": {
    type: "bracket-poll",
    label: "Bracket / Knockout Poll",
    tagline: "Your menu, one champion.",
    blurb:
      "Head-to-head votes until one item wins. You get real preference data, they get an opinion fight worth sharing.",
    category: "community",
    engine: "score",
    icon: "git-fork",
    swatch: ["#4f46e5", "#db2777"],
    cooldownHours: 24,
    maxScore: 100,
    hasLeaderboard: false,
    scoreLabel: "votes",
    winRule: "finish",
    defaultTarget: 0,
    usesBlanks: false,
    defaultConfig: {
      question: "Which one wins?",
      entrants: [
        { label: "Jollof rice", emoji: "🍚", imageUrl: "" },
        { label: "Fried rice", emoji: "🍛", imageUrl: "" },
        { label: "Suya wrap", emoji: "🌯", imageUrl: "" },
        { label: "Pepper soup", emoji: "🍲", imageUrl: "" },
      ],
    },
    fields: [
      { key: "question", label: "The matchup question", type: "text", maxLength: 120 },
      {
        key: "entrants",
        label: "Contenders",
        type: "list",
        itemNoun: "contender",
        minItems: 2,
        maxItems: 16,
        newItem: { label: "", emoji: "", imageUrl: "" },
        help: "Works best with 4, 8, or 16 — byes are handled automatically.",
        fields: [
          { key: "label", label: "Name", type: "text", maxLength: 60 },
          { key: "emoji", label: "Emoji", type: "text", maxLength: 8 },
          { key: "imageUrl", label: "Image URL (optional)", type: "image" },
        ],
      },
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
      emojiListField("targetEmoji", "Hit this", "Worth points."),
      emojiListField("decoyEmoji", "Avoid this", "Costs points."),
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
    scoreLabel: "gates",
    winRule: "target",
    defaultTarget: 8,
    usesBlanks: false,
    defaultConfig: { flyerEmoji: "🐤", pipeColor: "#16a34a", difficulty: "normal" },
    fields: [
      emojiListField("flyerEmoji", "The flyer", "Your mascot, an emoji."),
      { key: "pipeColor", label: "Pipe colour", type: "text", maxLength: 7 },
      difficultyField,
    ],
  },

  jigsaw: {
    type: "jigsaw",
    label: "Jigsaw / Photo Puzzle",
    tagline: "Reassemble the picture against the clock.",
    blurb:
      "Drop in a product shot and it becomes a puzzle. Players stare at your photo for a full minute — that's the point.",
    category: "arcade",
    engine: "score",
    icon: "puzzle",
    swatch: ["#7c3aed", "#0891b2"],
    cooldownHours: 6,
    maxScore: 10000,
    hasLeaderboard: true,
    scoreLabel: "points",
    winRule: "target",
    defaultTarget: 400,
    usesBlanks: false,
    defaultConfig: { imageUrl: "", size: 3, timeLimit: 180 },
    fields: [
      {
        key: "imageUrl",
        label: "Picture",
        type: "image",
        help: "A square-ish product or shopfront photo works best.",
      },
      {
        key: "size",
        label: "Pieces",
        type: "select",
        options: [
          { value: "3", label: "3 × 3 (9 pieces)" },
          { value: "4", label: "4 × 4 (16 pieces)" },
          { value: "5", label: "5 × 5 (25 pieces)" },
        ],
      },
      { key: "timeLimit", label: "Time limit (seconds)", type: "number", min: 60, max: 600 },
    ],
  },

  "spot-difference": {
    type: "spot-difference",
    label: "Spot the Difference",
    tagline: "Two photos, a handful of changes.",
    blurb:
      "Mark the spots you changed and the game builds itself. Forces a long, careful look at two of your images.",
    category: "arcade",
    engine: "score",
    icon: "search",
    swatch: ["#ea580c", "#2563eb"],
    cooldownHours: 6,
    maxScore: 1000,
    hasLeaderboard: true,
    scoreLabel: "found",
    winRule: "target",
    defaultTarget: 3,
    usesBlanks: false,
    defaultConfig: {
      imageA: "",
      imageB: "",
      timeLimit: 120,
      spots: [{ x: 30, y: 40, r: 9 }],
    },
    fields: [
      { key: "imageA", label: "Original image", type: "image" },
      { key: "imageB", label: "Edited image", type: "image" },
      { key: "timeLimit", label: "Time limit (seconds)", type: "number", min: 30, max: 600 },
      {
        key: "spots",
        label: "Differences",
        type: "list",
        itemNoun: "difference",
        minItems: 1,
        maxItems: 12,
        newItem: { x: 50, y: 50, r: 9 },
        help: "Position each difference as a percentage of the image (0–100) and give it a radius.",
        fields: [
          { key: "x", label: "X %", type: "number", min: 0, max: 100 },
          { key: "y", label: "Y %", type: "number", min: 0, max: 100 },
          { key: "r", label: "Radius %", type: "number", min: 3, max: 25 },
        ],
      },
    ],
  },

  "tic-tac-toe": {
    type: "tic-tac-toe",
    label: "Tic-Tac-Toe",
    tagline: "Beat the house, take the prize.",
    blurb:
      "Everyone already knows the rules, which makes it the fastest game to launch. Set the difficulty to decide how often the house loses.",
    category: "arcade",
    engine: "score",
    icon: "x",
    swatch: ["#334155", "#0ea5e9"],
    cooldownHours: 12,
    maxScore: 100,
    hasLeaderboard: false,
    scoreLabel: "wins",
    winRule: "target",
    defaultTarget: 1,
    usesBlanks: false,
    defaultConfig: {
      difficulty: "normal",
      rounds: 1,
      playerMark: "❌",
      houseMark: "⭕",
    },
    fields: [
      {
        key: "difficulty",
        label: "How good is the house?",
        type: "select",
        options: [
          { value: "easy", label: "Easy — plays randomly" },
          { value: "normal", label: "Normal — blocks and wins when obvious" },
          { value: "hard", label: "Unbeatable — a draw is the best you get" },
        ],
      },
      {
        key: "rounds",
        label: "Rounds per play",
        type: "number",
        min: 1,
        max: 5,
        help: "The score is how many of these rounds the player wins.",
      },
      emojiListField("playerMark", "Player's mark", "An emoji or letter."),
      emojiListField("houseMark", "House's mark", "An emoji or letter."),
    ],
  },
};

export const GAME_LIST: GameDefinition[] = GAME_TYPES.map((t) => GAMES[t]);

export function isGameType(value: string): value is GameType {
  return (GAME_TYPES as readonly string[]).includes(value);
}

export function gameDef(type: string): GameDefinition | null {
  return isGameType(type) ? GAMES[type] : null;
}

export function gamesInCategory(category: GameCategory): GameDefinition[] {
  return GAME_LIST.filter((g) => g.category === category);
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
