// Shapes shared by the games API, the dashboard builder, and the players.

export type GameEngine = "chance" | "score";
export type GameStatus = "draft" | "active" | "paused" | "archived";

// Per-type settings authored in the builder (shape defined by each game's
// `fields` in the catalog) and read by that game's component.
export type GameConfig = Record<string, unknown>;

export interface GameTheme {
  accent?: string;
  heroUrl?: string;
}

// A prize slot as the player is allowed to see it: never the odds, never the
// remaining stock of anything they could still win.
export interface PublicPrizeSlot {
  position: number;
  kind: "prize" | "blank";
  description: string;
  details: string | null;
  icon: string | null;
  // Score games publish the bar to clear — that's the whole point of playing.
  minScore: number;
  soldOut: boolean;
}

export interface LeaderboardEntry {
  maskedEmail: string;
  score: number;
  at: string;
  rank: number;
}

// Everything the public player page needs for one game.
export interface PublicGame {
  slug: string;
  type: string;
  engine: GameEngine;
  title: string;
  description: string | null;
  config: GameConfig;
  theme: GameTheme;
  cooldownHours: number;
  maxWinsPerPlayer: number;
  prizes: PublicPrizeSlot[];
  playsCount: number;
  winsCount: number;
  hasLeaderboard: boolean;
  leaderboard: LeaderboardEntry[];
}

// The business behind the games, for the branded shell.
export interface PublicGameHost {
  businessName: string;
  slug: string;
  logoUrl: string | null;
  tagline: string | null;
  brandColor: string;
  whatsapp: string | null;
  contactEmail: string | null;
}

export interface PublicGamesHub {
  host: PublicGameHost;
  games: {
    slug: string;
    type: string;
    title: string;
    description: string | null;
    theme: GameTheme;
    playsCount: number;
    prizeTeasers: string[];
  }[];
}

// What POST /start hands back before the player may play.
export type StartPlayResult =
  | { result: "started"; token: string; canWin: boolean }
  | { result: "cooldown"; nextPlayAt: string }
  | { result: "no_plays" }
  | { result: "error"; error: string };

// What POST /finish grades the play into.
export interface GameOutcome {
  result: "win" | "lose" | "no_plays";
  // Chance games: which segment the server landed on, so the wheel/box/card
  // can animate to a result it did not choose.
  segmentIndex: number | null;
  prize: { description: string; details: string | null; icon: string | null } | null;
  code: string | null;
  expiresAt: string | null;
  score: number;
  bestScore: number;
  rank: number | null;
  loyaltyPoints: number;
  pointsExpireAt: string | null;
  loyaltyCode: string | null;
  canWinAgain: boolean;
  nextPlayAt: string | null;
}

// One game in the merchant's dashboard list.
export interface GameSummary {
  id: string;
  slug: string;
  type: string;
  engine: GameEngine;
  title: string;
  description: string | null;
  status: GameStatus;
  /** "suggested" games are the ones we wrote from the business's answers. */
  source: "manual" | "suggested";
  config: GameConfig;
  theme: GameTheme;
  cooldownHours: number;
  maxWinsPerPlayer: number;
  playsCount: number;
  winsCount: number;
  createdAt: string;
  players: number;
  redeemedCount: number;
  prizes: {
    id: string;
    kind: "prize" | "blank";
    description: string;
    details: string | null;
    icon: string | null;
    expiryDays: number;
    stock: number;
    claimed: number;
    weight: number;
    minScore: number;
    position: number;
  }[];
}

// A prize slot as the builder submits it.
export interface PrizeDraft {
  kind: "prize" | "blank";
  description: string;
  details?: string | null;
  icon?: string | null;
  expiry_days?: number;
  stock?: number;
  weight?: number;
  min_score?: number;
}
