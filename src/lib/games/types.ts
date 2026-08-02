// Shapes shared by the games API, the dashboard builder, and the players.

export type GameEngine = "chance" | "score";

/**
 * How a game hands out prizes.
 *   "leaderboard" — the weekly board: top places win when the week closes.
 *   "instant"     — the older model, kept alive for games already published.
 */
export type GameAwardMode = "leaderboard" | "instant";
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
  /** Leaderboard games: which place on the board wins this. */
  awardRank: number | null;
  soldOut: boolean;
}

export interface LeaderboardEntry {
  maskedEmail: string;
  score: number;
  at: string;
  rank: number;
  /** The prize waiting at this place, if there is one. */
  prize: string | null;
  /** True for the row belonging to the player looking at the board. */
  isYou: boolean;
}

/** The week a leaderboard is running. */
export interface GameSeason {
  number: number;
  startsAt: string;
  endsAt: string;
}

/** What the last completed week paid out. */
export interface PastWinner {
  rank: number;
  maskedEmail: string;
  score: number;
  prize: string | null;
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
  awardMode: GameAwardMode;
  /** Leaderboard games: the week that's running now. */
  season: GameSeason | null;
  /** Leaderboard games: how the last week finished. */
  lastWinners: PastWinner[];
  /** How many plays a player gets each week, before sharing. */
  weeklyLives: number;
  /** How many extra plays sharing can earn in a day. */
  maxBonusLives: number;
  /** How many people are on this week's board. */
  playerCount: number;
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
    /** The top of this week's board, masked — empty when nobody has played. */
    leaderboard: LeaderboardEntry[];
    /** Leaderboard games: when this week's prizes go out. */
    season: GameSeason | null;
    /** How many people are on this week's board. */
    playerCount: number;
    /** Where this player stands, if the cookie knows them. */
    yourRank: number | null;
    yourBest: number;
  }[];
  /** The one pool of lives, shared across every game here, for the week. */
  player: {
    livesLeft: number;
    weeklyLives: number;
    maxBonusLives: number;
  } | null;
}

// What POST /start hands back before the player may play.
export type StartPlayResult =
  | { result: "started"; token: string; canWin: boolean; livesLeft: number }
  | { result: "cooldown"; nextPlayAt: string }
  | { result: "no_lives"; nextLivesAt: string }
  | { result: "no_plays" }
  | { result: "error"; error: string };

// What POST /finish grades the play into.
export interface GameOutcome {
  /** "scored" is the leaderboard result: the run went on the board. */
  result: "win" | "lose" | "scored" | "no_plays";
  // Chance games: which segment the server landed on, so the wheel/box/card
  // can animate to a result it did not choose.
  segmentIndex: number | null;
  prize: { description: string; details: string | null; icon: string | null } | null;
  code: string | null;
  expiresAt: string | null;
  score: number;
  bestScore: number;
  rank: number | null;
  canWinAgain: boolean;
  nextPlayAt: string | null;
  /** Leaderboard games: plays left this week, and when the week closes. */
  livesLeft: number;
  seasonEndsAt: string | null;
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
  awardMode: GameAwardMode;
  seasonDays: number;
  weeklyLives: number;
  maxBonusLives: number;
  playsCount: number;
  winsCount: number;
  createdAt: string;
  players: number;
  redeemedCount: number;
  /** The business's share of extra plays bought on this game, in kobo. */
  earnedKobo: number;
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
    awardRank: number | null;
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
  /** Leaderboard games: which place wins this. */
  award_rank?: number;
}
