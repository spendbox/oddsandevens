// Turns what a business told us into finished, playable games.
//
// Every blueprint here comes out fully configured — title, artwork, questions,
// prizes, odds — so it can be written straight to the database as a draft the
// business previews rather than a form they fill in. Editing is something they
// do afterwards, if they feel like it.

import {
  industryPack,
  type BusinessProfile,
} from "@/lib/business/profile";
import { GAMES, type GameType } from "./catalog";
import type { PrizeRow } from "./slots";
import type { GameConfig } from "./types";

export interface GameBlueprint {
  type: GameType;
  title: string;
  description: string;
  config: GameConfig;
  prizes: PrizeRow[];
  winPercent: number;
  cooldownHours: number;
  maxWins: number;
  /** Shown on the card: why this game, for this business. */
  why: string;
}

export interface SuggestionInput {
  businessName: string;
  profile: BusinessProfile;
  /** The business's reward catalogue, if they've started one. */
  rewards: { description: string; details: string | null; icon: string | null; default_expiry_days: number }[];
}

const has = (goals: string[] | undefined, key: string) =>
  (goals ?? []).includes(key);

/** The first prize for a game: their own reward, then their stated offer. */
function primaryPrize(input: SuggestionInput, fallbackTarget: number): PrizeRow {
  const reward = input.rewards[0];
  if (reward) {
    return {
      description: reward.description,
      details: reward.details ?? "",
      icon: reward.icon,
      expiryDays: reward.default_expiry_days,
      stock: 25,
      minScore: fallbackTarget,
    };
  }
  const pack = industryPack(input.profile.industry);
  const offer = (input.profile.offers ?? []).find((o) => o.trim().length > 0);
  return {
    description: offer ?? pack.offerExamples[0],
    details: "",
    icon: null,
    expiryDays: 30,
    stock: 25,
    minScore: fallbackTarget,
  };
}

/** A second, smaller prize so a wheel has a ladder rather than one slot. */
function secondaryPrize(input: SuggestionInput): PrizeRow | null {
  const reward = input.rewards[1];
  const pack = industryPack(input.profile.industry);
  const offer = (input.profile.offers ?? [])[1];
  const description = reward?.description ?? offer ?? pack.offerExamples[1];
  if (!description) return null;
  return {
    description,
    details: reward?.details ?? "",
    icon: reward?.icon ?? null,
    expiryDays: reward?.default_expiry_days ?? 30,
    stock: 50,
    minScore: 0,
  };
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
  const prize = primaryPrize(input, 0);
  const second = secondaryPrize(input);
  const blueprints: GameBlueprint[] = [];

  // 1. The wheel. Universal, instantly understood, works for every trade.
  blueprints.push({
    type: "spin-wheel",
    title: `Spin & win at ${businessName}`,
    description: `One spin, one chance at something from ${businessName}.`,
    config: { ...GAMES["spin-wheel"].defaultConfig, hubLabel: "" },
    prizes: second ? [prize, second] : [prize],
    winPercent: 25,
    cooldownHours: 24,
    maxWins: 1,
    why: "The one everybody understands in a second — the safest first game to share.",
  });

  // 2. Scratch card, for a second daily-habit game.
  blueprints.push({
    type: "scratch-card",
    title: `${businessName} scratch card`,
    description: "Scratch the foil and see what's underneath.",
    config: {
      ...GAMES["scratch-card"].defaultConfig,
      coverText: "Scratch here",
    },
    prizes: [prize],
    winPercent: 20,
    cooldownHours: 24,
    maxWins: 1,
    why: has(profile.goals, "repeat")
      ? "A once-a-day habit — you said you want people coming back."
      : "A quieter alternative to the wheel; good on receipts and packaging.",
  });

  // 3. Recommender quiz, built from their actual products.
  if (items.length >= 2) {
    const outcomes = items.slice(0, 4).map((item, i) => ({
      key: String.fromCharCode(97 + i),
      title: item,
      blurb: `Based on your answers, ${item} is the one for you.`,
      linkUrl: "",
    }));
    blueprints.push({
      type: "recommender-quiz",
      title: `What should you order at ${businessName}?`,
      description: "Three quick questions and we'll pick your match.",
      config: {
        intro: "Answer three quick questions and we'll pick your match.",
        outcomes,
        questions: [
          {
            prompt: "How adventurous are you feeling?",
            options: outcomes.map((o, i) => ({
              label: i === 0 ? "Play it safe" : i === 1 ? "Surprise me" : `Somewhere in between (${i})`,
              outcome: o.key,
            })),
          },
          {
            prompt: "Pick a mood",
            options: outcomes.map((o) => ({
              label: `The ${o.title.toLowerCase()} kind of mood`,
              outcome: o.key,
            })),
          },
          {
            prompt: "How hungry are you, honestly?",
            options: outcomes.map((o, i) => ({
              label: i === 0 ? "Just a little something" : i === 1 ? "Properly hungry" : "Feed me everything",
              outcome: o.key,
            })),
          },
        ],
      },
      prizes: [{ ...prize, minScore: 0 }],
      winPercent: 100,
      cooldownHours: 12,
      maxWins: 1,
      why: has(profile.goals, "launch") || has(profile.goals, "data")
        ? "Everyone finishes it, and every answer tells you what people actually want."
        : "The highest-intent game here — it ends by naming something you sell.",
    });
  }

  // 4. An arcade game dressed in their trade's artwork.
  blueprints.push({
    type: "falling-catcher",
    title: `Catch the ${pack.label.split(" ")[0].toLowerCase()} drop`,
    description: `Catch what falls, dodge what doesn't belong.`,
    config: {
      ...GAMES["falling-catcher"].defaultConfig,
      goodEmojis: pack.items.slice(0, 3).join(" "),
      badEmojis: pack.hazard,
      lives: 3,
      duration: 45,
    },
    prizes: [{ ...prize, minScore: 20, stock: 25 }],
    winPercent: 0,
    cooldownHours: 6,
    maxWins: 1,
    why: has(profile.goals, "awareness")
      ? "A high-score chase with a leaderboard — the kind people send to a friend."
      : "Playable in forty-five seconds, and the items are yours.",
  });

  // 5. Myth vs fact — teaches something true about the trade.
  blueprints.push({
    type: "myth-fact",
    title: `${pack.label.split(" ")[0]} myths, busted`,
    description: "Three statements. Which ones are actually true?",
    config: { statements: pack.mythFacts },
    prizes: [{ ...prize, minScore: Math.max(pack.mythFacts.length - 1, 1), stock: 25 }],
    winPercent: 0,
    cooldownHours: 12,
    maxWins: 1,
    why: "Cheap credibility: customers leave knowing something true about what you sell.",
  });

  // 6. Goal-specific extras.
  if (has(profile.goals, "footfall")) {
    blueprints.push({
      type: "scavenger-hunt",
      title: `Find the codes at ${businessName}`,
      description: "Three codes hidden around us. Find them all.",
      config: {
        intro: `Three codes are hidden around ${businessName}${
          profile.city ? ` in ${profile.city}` : ""
        }. Find them all and the prize is yours.`,
        stops: [
          { hint: "On the poster by the till", code: "TILL01" },
          { hint: "In our story today", code: "STORY2" },
          { hint: "On the bottom of your receipt", code: "THANKS" },
        ],
      },
      prizes: [{ ...prize, minScore: 3, stock: 25 }],
      winPercent: 0,
      cooldownHours: 0,
      maxWins: 1,
      why: "You said you want people through the door — this one only works in person.",
    });
  }

  if ((has(profile.goals, "data") || has(profile.goals, "launch")) && items.length >= 2) {
    blueprints.push({
      type: "bracket-poll",
      title: `Which ${businessName} favourite wins?`,
      description: "Head to head until one is left standing.",
      config: {
        question: "Which one wins?",
        entrants: items.slice(0, 8).map((item, i) => ({
          label: item,
          emoji: pack.items[i % pack.items.length],
          imageUrl: "",
        })),
      },
      prizes: [{ ...prize, minScore: 0, stock: 50 }],
      winPercent: 0,
      cooldownHours: 24,
      maxWins: 1,
      why: "Real preference data from your own customers, disguised as an argument.",
    });
  }

  if (has(profile.goals, "awareness")) {
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
              : `What does ${businessName} do best?`,
            options: [...items.slice(0, 3), "None of these"],
            answerIndex: 1,
          },
          {
            prompt: profile.city
              ? `Which city are we in?`
              : "Which of these do we sell?",
            options: profile.city
              ? [profile.city, "Abuja", "Kano", "Ibadan"]
              : [...items.slice(0, 3), "Motorcycles"],
            answerIndex: 1,
          },
        ],
      },
      prizes: [{ ...prize, minScore: 150, stock: 25 }],
      winPercent: 0,
      cooldownHours: 12,
      maxWins: 1,
      why: "A live leaderboard gives people a reason to come back and beat someone.",
    });
  }

  // 7. Always keep one pure arcade game in reserve.
  blueprints.push({
    type: "whack-a-mole",
    title: `Whack it at ${businessName}`,
    description: "Tap what pops up. Don't tap the wrong thing.",
    config: {
      ...GAMES["whack-a-mole"].defaultConfig,
      targetEmoji: pack.items[0],
      decoyEmoji: pack.hazard,
    },
    prizes: [{ ...prize, minScore: 20, stock: 25 }],
    winPercent: 0,
    cooldownHours: 6,
    maxWins: 1,
    why: "Nobody needs the rules explained, which makes it the easiest one to share cold.",
  });

  return blueprints;
}
