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

const has = (goals: string[] | undefined, key: string) =>
  (goals ?? []).includes(key);

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

/** What they sell, falling back to the industry's examples. */
function products(input: SuggestionInput): string[] {
  const own = (input.profile.sells ?? []).filter((s) => s.trim().length > 0);
  return own.length > 0 ? own : industryPack(input.profile.industry).sellsExamples;
}

/**
 * Writes the games. Ordered best-first: the list is capped by the caller, and
 * the first few are the ones we'd stake the business's first impression on.
 */
export function suggestGames(input: SuggestionInput): GameBlueprint[] {
  const { businessName, profile } = input;
  const pack = industryPack(profile.industry);
  const items = products(input);
  const prizes = podium(input);
  const trade = pack.label.split(" ")[0];
  const blueprints: GameBlueprint[] = [];

  // 1. The catcher. Instantly understood, forty-five seconds a go, and every
  //    item on screen is something the business sells.
  blueprints.push({
    type: "falling-catcher",
    title: `Catch the ${trade.toLowerCase()} drop`,
    description: "Catch what falls, dodge what doesn't belong.",
    config: {
      ...GAMES["falling-catcher"].defaultConfig,
      goodEmojis: pack.items.slice(0, 3).join(" "),
      badEmojis: pack.hazard,
      lives: 3,
      duration: 45,
    },
    prizes,
    cooldownHours: 0,
    maxWins: 1,
    why: "Understood in a second, over in forty-five — the easiest board to get people onto.",
  });

  // 2. Whack-a-mole. Nobody needs the rules explained.
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

  // 3. Myth vs fact. Teaches something true about the trade.
  blueprints.push({
    type: "myth-fact",
    title: `${trade} myths, busted`,
    description: "Statements about our trade. Which ones are actually true?",
    config: { statements: pack.mythFacts },
    prizes,
    cooldownHours: 0,
    maxWins: 1,
    why: "Cheap credibility: players leave knowing something true about what you sell.",
  });

  // 4. Memory match, dressed in their products.
  blueprints.push({
    type: "memory-match",
    title: `${businessName} memory match`,
    description: "Clear the board as fast as you can.",
    config: {
      ...GAMES["memory-match"].defaultConfig,
      faces: pack.items.join(" "),
      pairs: 6,
      timeLimit: 90,
    },
    prizes,
    cooldownHours: 0,
    maxWins: 1,
    why: "Every flip is another look at what you sell, and the clock makes it competitive.",
  });

  // 5. The runner, for a longer-tail high score.
  blueprints.push({
    type: "endless-runner",
    title: `The ${businessName} run`,
    description: "How far can you get?",
    config: {
      ...GAMES["endless-runner"].defaultConfig,
      runnerEmoji: pack.mascot,
      obstacleEmoji: pack.hazard,
      lives: 3,
    },
    prizes,
    cooldownHours: 0,
    maxWins: 1,
    why: has(profile.goals, "awareness")
      ? "The distances get absurd, which is exactly what people screenshot."
      : "A score that keeps creeping up all week, so the board never settles.",
  });

  // 6. Trivia about the business itself, when they've told us enough.
  if (items.length >= 2 || profile.city || profile.funFact) {
    blueprints.push({
      type: "leaderboard-trivia",
      title: `How well do you know ${businessName}?`,
      description: "Answer fast — the clock is worth points.",
      config: {
        secondsPerQuestion: 15,
        questions: [
          {
            prompt: profile.funFact
              ? `True or not: ${profile.funFact}`
              : `Which of these do we sell?`,
            options: [...items.slice(0, 3), "None of these"],
            answerIndex: 1,
          },
          {
            prompt: profile.city
              ? "Which city are we in?"
              : "Which of these is on our menu?",
            options: profile.city
              ? [profile.city, "Abuja", "Kano", "Ibadan"]
              : [...items.slice(0, 3), "Motorcycles"],
            answerIndex: 1,
          },
        ],
      },
      prizes,
      cooldownHours: 0,
      maxWins: 1,
      why: has(profile.goals, "data")
        ? "Speed scoring makes it a real race, and the answers tell you what people know about you."
        : "Regulars have an edge, which is exactly the point.",
    });
  }

  return blueprints;
}
