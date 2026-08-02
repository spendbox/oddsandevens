// The business knowledge base.
//
// A short, mostly-tappable questionnaire whose answers are the raw material
// for every suggested game: what you sell becomes the items in a catcher game,
// your offers become prizes, your goal decides which games we write at all.
//
// It is designed to be answered in pieces. Nothing is required, every field
// carries a weight, and the dashboard shows how complete the picture is and
// what the next answer would unlock.

export interface BusinessProfile {
  industry?: string;
  /** Top things they sell — feeds quizzes, polls, and arcade items. */
  sells?: string[];
  audience?: string;
  /** What they're trying to get out of running games. */
  goals?: string[];
  /** Things they're happy to give away — these become prizes. */
  offers?: string[];
  tone?: string;
  city?: string;
  busiestDay?: string;
  /** One true thing about the business — becomes a trivia question. */
  funFact?: string;
}

// ---------------------------------------------------------------------------
// Industries — each carries the raw material its games are built from.
// ---------------------------------------------------------------------------

export interface IndustryPack {
  /** lucide-react icon name, resolved by the settings chips. */
  icon: string;
  key: string;
  label: string;
  emoji: string;
  /** Items that rain down, get sliced, get whacked, fill memory cards. */
  items: string[];
  /** The thing to dodge in an arcade game. */
  hazard: string;
  /** The mascot that runs and flies. */
  mascot: string;
  /** Example products, used when the business hasn't listed their own. */
  sellsExamples: string[];
  /** Example giveaways, used to seed the first prize. */
  offerExamples: string[];
  /** Myth-vs-fact statements that are true of the whole industry. */
  mythFacts: { text: string; isFact: boolean; explanation: string }[];
}

export const INDUSTRIES: IndustryPack[] = [
  {
    key: "restaurant",
    label: "Restaurant / kitchen",
    emoji: "🍲",
    icon: "utensils-crossed",
    items: ["🍕", "🍔", "🍗", "🍚", "🌯"],
    hazard: "🌶️",
    mascot: "🍳",
    sellsExamples: ["Jollof rice", "Suya wrap", "Pepper soup", "Fried rice"],
    offerExamples: ["Free side with any main", "10% off your next order", "Free drink"],
    mythFacts: [
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
        text: "Reheating rice is always unsafe.",
        isFact: false,
        explanation: "It's safe if it was cooled quickly and stored cold. It's the cooling that matters.",
      },
    ],
  },
  {
    key: "cafe",
    label: "Café / bakery",
    emoji: "☕",
    icon: "coffee",
    items: ["☕", "🥐", "🍰", "🍩", "🥤"],
    hazard: "🧊",
    mascot: "☕",
    sellsExamples: ["Flat white", "Croissant", "Banana bread", "Iced latte"],
    offerExamples: ["Free coffee with any pastry", "Buy one get one pastry", "15% off"],
    mythFacts: [
      {
        text: "Dark roast has more caffeine than light roast.",
        isFact: false,
        explanation: "Roasting burns caffeine off. Light roast edges it, bean for bean.",
      },
      {
        text: "Espresso has less caffeine per serving than drip coffee.",
        isFact: true,
        explanation: "A shot is small. Per cup, drip usually wins.",
      },
      {
        text: "Bread staling is mostly about drying out.",
        isFact: false,
        explanation: "It's starch retrogradation — which is why warming a stale loaf revives it.",
      },
    ],
  },
  {
    key: "fashion",
    label: "Fashion / boutique",
    emoji: "👗",
    icon: "shirt",
    items: ["👗", "👕", "👟", "👜", "🧢"],
    hazard: "🧵",
    mascot: "🕺",
    sellsExamples: ["Linen shirt", "Wide-leg jeans", "Ankara dress", "Sneakers"],
    offerExamples: ["20% off one item", "Free tote with any purchase", "Free alterations"],
    mythFacts: [
      {
        text: "Washing jeans less makes them last longer.",
        isFact: true,
        explanation: "Every wash abrades the fibres. Spot-clean and air them instead.",
      },
      {
        text: "Linen is only a hot-weather fabric.",
        isFact: false,
        explanation: "Layered, it insulates well — it's the weave that keeps you cool, not the fibre.",
      },
    ],
  },
  {
    key: "beauty",
    label: "Beauty / salon",
    emoji: "💅",
    icon: "scissors",
    items: ["💅", "💄", "🧴", "✂️", "🪮"],
    hazard: "🧪",
    mascot: "💇",
    sellsExamples: ["Gel manicure", "Silk press", "Braids", "Facial"],
    offerExamples: ["Free treatment add-on", "25% off your next visit", "Free consultation"],
    mythFacts: [
      {
        text: "Cutting hair makes it grow back faster.",
        isFact: false,
        explanation: "Growth happens at the follicle. Trims just remove the split ends that break.",
      },
      {
        text: "You still need sunscreen on cloudy days.",
        isFact: true,
        explanation: "UVA passes straight through cloud cover.",
      },
    ],
  },
  {
    key: "grocery",
    label: "Grocery / mini-mart",
    emoji: "🛒",
    icon: "shopping-basket",
    items: ["🍎", "🥛", "🍞", "🥚", "🧻"],
    hazard: "💸",
    mascot: "🛒",
    sellsExamples: ["Fresh produce", "Household basics", "Frozen goods", "Drinks"],
    offerExamples: ["₦1,000 off a ₦10,000 shop", "Free bag of rice", "Buy one get one"],
    mythFacts: [
      {
        text: "Best-before and use-by mean the same thing.",
        isFact: false,
        explanation: "Best-before is about quality; use-by is about safety.",
      },
      {
        text: "Most fruit keeps longer out of the fridge than in it.",
        isFact: false,
        explanation: "Only some — bananas and tomatoes hate the cold, berries love it.",
      },
    ],
  },
  {
    key: "fitness",
    label: "Gym / fitness",
    emoji: "🏋️",
    icon: "dumbbell",
    items: ["🏋️", "🥊", "🧘", "🚴", "💪"],
    hazard: "🍩",
    mascot: "🏃",
    sellsExamples: ["Monthly membership", "Personal training", "Class pass", "Day pass"],
    offerExamples: ["A free week", "Free personal training session", "20% off a month"],
    mythFacts: [
      {
        text: "You can target fat loss in one specific area.",
        isFact: false,
        explanation: "Spot reduction isn't a thing — fat comes off everywhere at once.",
      },
      {
        text: "Muscle soreness is a poor measure of a good workout.",
        isFact: true,
        explanation: "Soreness tracks novelty, not progress.",
      },
    ],
  },
  {
    key: "pharmacy",
    label: "Pharmacy / health",
    emoji: "💊",
    icon: "pill",
    items: ["💊", "🩺", "🧴", "🌡️", "🩹"],
    hazard: "🍭",
    mascot: "🧑‍⚕️",
    sellsExamples: ["Prescriptions", "Vitamins", "Skincare", "First aid"],
    offerExamples: ["Free blood-pressure check", "15% off vitamins", "Free delivery"],
    mythFacts: [
      {
        text: "Antibiotics work on colds.",
        isFact: false,
        explanation: "Colds are viral. Antibiotics do nothing but breed resistance.",
      },
      {
        text: "You should finish a course exactly as prescribed.",
        isFact: true,
        explanation: "Stopping early is how resistant strains get their start.",
      },
    ],
  },
  {
    key: "electronics",
    label: "Electronics / gadgets",
    emoji: "📱",
    icon: "smartphone",
    items: ["📱", "🎧", "💻", "⌚", "🔌"],
    hazard: "⚡",
    mascot: "🤖",
    sellsExamples: ["Phones", "Headphones", "Laptops", "Accessories"],
    offerExamples: ["Free screen protector", "10% off accessories", "Free setup"],
    mythFacts: [
      {
        text: "Charging overnight destroys a modern battery.",
        isFact: false,
        explanation: "Charging stops at full. Heat is what actually ages a battery.",
      },
      {
        text: "More megapixels always means a better photo.",
        isFact: false,
        explanation: "Sensor size and lens quality matter far more.",
      },
    ],
  },
  {
    key: "services",
    label: "Local services",
    emoji: "🧰",
    icon: "wrench",
    items: ["🧰", "🧼", "🔧", "🚿", "📦"],
    hazard: "⏰",
    mascot: "🧑‍🔧",
    sellsExamples: ["Laundry", "Repairs", "Cleaning", "Delivery"],
    offerExamples: ["One free pickup", "20% off your next job", "Free quote"],
    mythFacts: [
      {
        text: "Hotter water always cleans clothes better.",
        isFact: false,
        explanation: "Modern detergents are built for cold — and hot sets many stains.",
      },
      {
        text: "Regular servicing costs less than repairs.",
        isFact: true,
        explanation: "Almost always, and by a wide margin.",
      },
    ],
  },
  {
    key: "other",
    label: "Something else",
    emoji: "✨",
    icon: "store",
    items: ["⭐", "🎁", "✨", "🎉", "💎"],
    hazard: "💣",
    mascot: "🏃",
    sellsExamples: ["Your best seller", "A popular add-on", "A seasonal favourite"],
    offerExamples: ["10% off your next order", "A free gift", "Free delivery"],
    mythFacts: [
      {
        text: "People are more likely to return to a business that rewards them.",
        isFact: true,
        explanation: "Reward loops beat discounts for repeat visits, every time.",
      },
      {
        text: "Loyalty schemes only work for big chains.",
        isFact: false,
        explanation: "Small businesses see the bigger lift — you already know your regulars.",
      },
    ],
  },
];

export function industryPack(key: string | undefined): IndustryPack {
  return INDUSTRIES.find((i) => i.key === key) ?? INDUSTRIES[INDUSTRIES.length - 1];
}

// ---------------------------------------------------------------------------
// Goals — these decide which games get written.
// ---------------------------------------------------------------------------

export const GOALS = [
  {
    key: "repeat",
    label: "Get people coming back",
    emoji: "🔁",
    icon: "repeat",
    hint: "Daily games with a cooldown",
  },
  {
    key: "footfall",
    label: "Get people into the shop",
    emoji: "🚶",
    icon: "footprints",
    hint: "Hunts and in-store codes",
  },
  {
    key: "launch",
    label: "Push a new product",
    emoji: "🚀",
    icon: "rocket",
    hint: "Quizzes and polls about it",
  },
  {
    key: "awareness",
    label: "Get shared and seen",
    emoji: "📣",
    icon: "megaphone",
    hint: "High-score games with leaderboards",
  },
  {
    key: "data",
    label: "Learn what customers want",
    emoji: "📊",
    icon: "bar-chart-3",
    hint: "Polls and recommender quizzes",
  },
] as const;

export const TONES = [
  { key: "playful", label: "Playful", emoji: "🎉", icon: "party-popper" },
  { key: "warm", label: "Warm and friendly", emoji: "🤗", icon: "heart-handshake" },
  { key: "premium", label: "Premium and understated", emoji: "🥂", icon: "gem" },
] as const;

export const DAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday",
  "Friday", "Saturday", "Sunday",
] as const;

// ---------------------------------------------------------------------------
// Completeness — the progress bar, and what the next answer buys.
// ---------------------------------------------------------------------------

export interface CompletionItem {
  key: string;
  label: string;
  /** Share of the bar this answer is worth. */
  weight: number;
  done: boolean;
  /** What answering it improves. */
  unlocks: string;
}

export interface MerchantBasics {
  business_name?: string | null;
  logo_url?: string | null;
  tagline?: string | null;
  brand_color?: string | null;
  whatsapp?: string | null;
  contact_email?: string | null;
}

const filled = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((v) => String(v ?? "").trim().length > 0).length > 0
    : String(value ?? "").trim().length > 0;

/**
 * Scores everything we know about a business — the knowledge base and the
 * branding — as one list of answered/unanswered items.
 */
export function completionItems(
  profile: BusinessProfile,
  merchant: MerchantBasics,
  extras: { hasReward: boolean; hasGame: boolean; payoutReady?: boolean }
): CompletionItem[] {
  return [
    {
      key: "industry",
      label: "What kind of business you run",
      weight: 16,
      done: filled(profile.industry),
      unlocks: "Games written for your trade, with the right artwork",
    },
    {
      key: "offers",
      label: "What you can give away",
      weight: 14,
      done: (profile.offers ?? []).filter((s) => s.trim()).length >= 1,
      unlocks: "Prizes filled in for you, so a game is ready to publish",
    },
    {
      key: "goals",
      label: "What you want out of it",
      weight: 12,
      done: (profile.goals ?? []).length >= 1,
      unlocks: "The right games chosen for the job, not just the popular ones",
    },
    {
      key: "logo",
      label: "Your logo",
      weight: 10,
      done: filled(merchant.logo_url),
      unlocks: "Your mark on every game you share",
    },
    {
      key: "brand",
      label: "Your brand colour and tagline",
      weight: 8,
      done: filled(merchant.brand_color) && filled(merchant.tagline),
      unlocks: "Games painted in your colours",
    },
    {
      key: "contact",
      label: "A way to reach you",
      weight: 3,
      done: filled(merchant.whatsapp) || filled(merchant.contact_email),
      unlocks: "A contact button on your games",
    },
    {
      key: "reward",
      label: "A reward in your catalogue",
      weight: 3,
      done: extras.hasReward,
      unlocks: "One-tap prizes when you build a game",
    },
    {
      key: "payout",
      label: "A bank account to be paid into",
      weight: 14,
      done: extras.payoutReady === true,
      unlocks: "Your share of anything players buy, straight to your bank",
    },
  ];
}

export function completionPercent(items: CompletionItem[]): number {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const earned = items.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0);
  return total === 0 ? 0 : Math.round((earned / total) * 100);
}

/** Enough to write genuinely tailored games rather than generic ones. */
export function canSuggestGames(profile: BusinessProfile): boolean {
  return filled(profile.industry);
}

/** Server-side sanitising — the profile is free text from the browser. */
export function sanitizeProfile(raw: unknown): BusinessProfile {
  const input = (raw ?? {}) as Record<string, unknown>;
  const text = (value: unknown, max: number) =>
    String(value ?? "").trim().slice(0, max) || undefined;
  const list = (value: unknown, max: number, itemMax: number) =>
    Array.isArray(value)
      ? value
          .map((v) => String(v ?? "").trim().slice(0, itemMax))
          .filter((v) => v.length > 0)
          .slice(0, max)
      : undefined;

  const industry = text(input.industry, 40);
  const tone = text(input.tone, 20);

  return {
    industry: INDUSTRIES.some((i) => i.key === industry) ? industry : undefined,
    sells: list(input.sells, 8, 60),
    audience: text(input.audience, 160),
    goals: (list(input.goals, 5, 20) ?? []).filter((g) =>
      (GOALS as readonly { key: string }[]).some((option) => option.key === g)
    ),
    offers: list(input.offers, 6, 120),
    tone: (TONES as readonly { key: string }[]).some((t) => t.key === tone)
      ? tone
      : undefined,
    city: text(input.city, 60),
    busiestDay: text(input.busiestDay, 20),
    funFact: text(input.funFact, 200),
  };
}
