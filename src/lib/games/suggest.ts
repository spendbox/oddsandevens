// Turns what a business told us into finished, playable games.
//
// Every blueprint comes out fully configured — title, artwork, questions,
// prizes — so it can be written straight to the database as a draft the
// business previews rather than a form they fill in.
//
// Every game here is a weekly competition, so the prizes are places on the
// board: the first row is first place, the second is second, and so on.

import { industryPack, type BusinessProfile } from "@/lib/business/profile";
import { GAMES, type GameType } from "./catalog";
import type { PrizeRow } from "./slots";
import type { GameConfig } from "./types";

export interface GameBlueprint {
  type: GameType;
  title: string;
  description: string;
  config: GameConfig;
  /** One prize per place on the weekly board: first row is first place. */
  prizes: PrizeRow[];
  cooldownHours: number;
  maxWins: number;
  /** Shown on the card: why this game, for this business. */
  why: string;
}

export interface SuggestionInput {
  businessName: string;
  profile: BusinessProfile;
  /** The business's reward catalogue, if they've started one. */
  rewards: {
    description: string;
    details: string | null;
    icon: string | null;
    default_expiry_days: number;
  }[];
}

/**
 * The podium. First place is their best reward or stated offer; second is the
 * next one down. Stock is how many weeks the prize can be won for.
 */
function podium(input: SuggestionInput): PrizeRow[] {
  const pack = industryPack(input.profile.industry);
  const offers = (input.profile.offers ?? []).filter((o) => o.trim().length > 0);

  const pick = (index: number): PrizeRow | null => {
    const reward = input.rewards[index];
    const description =
      reward?.description ?? offers[index] ?? pack.offerExamples[index];
    if (!description) return null;
    return {
      description,
      details: reward?.details ?? "",
      icon: reward?.icon ?? null,
      expiryDays: reward?.default_expiry_days ?? 30,
      // Enough weeks that the business doesn't have to think about it.
      stock: 12,
      minScore: 0,
      awardRank: index + 1,
    };
  };

  return [pick(0), pick(1)].filter((p): p is PrizeRow => p !== null);
}

/**
 * Writes the games. Ordered best-first: the list is capped by the caller, and
 * the first few are the ones we'd stake the business's first impression on.
 */
export function suggestGames(input: SuggestionInput): GameBlueprint[] {
  const { businessName, profile } = input;
  const pack = industryPack(profile.industry);
  const prizes = podium(input);
  const trade = pack.label.split(" ")[0];
  const blueprints: GameBlueprint[] = [];

  // 1. Whack-a-mole. Nobody needs the rules explained, and the reflex scoring
  //    means the board separates people from their first go.
  blueprints.push({
    type: "whack-a-mole",
    title: `Whack it at ${businessName}`,
    description: "Tap what pops up. Don't tap the wrong thing.",
    config: {
      ...GAMES["whack-a-mole"].defaultConfig,
      targetEmoji: pack.items[0],
      decoyEmoji: pack.hazard,
    },
    prizes,
    cooldownHours: 0,
    maxWins: 1,
    why: "Pure reflex — the game people replay hardest when they're two points off the top.",
  });

  // 2. Match three. The one everybody already knows how to play, which makes
  //    it the game a first-timer stays on longest.
  blueprints.push({
    type: "match-3",
    title: `${businessName} Match`,
    description: "Swap two jewels, line up three, watch the board fall.",
    config: { ...GAMES["match-3"].defaultConfig },
    prizes,
    cooldownHours: 0,
    maxWins: 1,
    why: "Everyone has played this before — nobody bounces off it, and the cascades are what get shared.",
  });

  // 3. Slicing. The most physical of the three, and the best-looking.
  blueprints.push({
    type: "slice-ninja",
    title: `Slice the ${trade.toLowerCase()}`,
    description: `Swipe through what's tossed up. Avoid the ${pack.hazard}.`,
    config: {
      ...GAMES["slice-ninja"].defaultConfig,
      sliceEmojis: pack.items.slice(0, 4).join(" "),
      bombEmoji: pack.hazard,
      duration: 45,
    },
    prizes,
    cooldownHours: 0,
    maxWins: 1,
    why: "The one people show other people — a good swipe looks good.",
  });

  return blueprints;
}
