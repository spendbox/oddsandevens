// Question games that never run dry.
//
// A quiz with three authored questions is a quiz you finish once. On a weekly
// leaderboard, where people play several times a day, that is worse than
// boring: everyone converges on full marks by the third go and the board stops
// measuring anything.
//
// So the authored questions become the *start* of a round rather than all of
// it. Every round is dealt fresh from three sources, in this order of
// preference:
//
//   1. What the business wrote — always first, because it is the thing they
//      actually want customers to learn.
//   2. Questions generated from what we know about them: their products, their
//      city, their busiest day, the true thing they told us about themselves.
//   3. A general bank, tagged by trade, so a café's myths are about coffee.
//
// The deal is shuffled per round, so two plays half an hour apart are two
// different quizzes.

import {
  INDUSTRIES,
  industryPack,
  type BusinessProfile,
} from "@/lib/business/profile";

export interface MythStatement {
  text: string;
  isFact: boolean;
  explanation: string;
}

export interface TriviaQuestion {
  prompt: string;
  options: string[];
  answerIndex: number;
}

/** How many of each a round is dealt, when there is enough material. */
export const MYTH_ROUND_SIZE = 20;
export const TRIVIA_ROUND_SIZE = 12;

// ---------------------------------------------------------------------------
// Shuffling
// ---------------------------------------------------------------------------

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// The general myth bank — true of any business with customers and a counter.
// ---------------------------------------------------------------------------

const GENERAL_MYTHS: MythStatement[] = [
  {
    text: "Paying with cash is always cheaper for the business than card.",
    isFact: false,
    explanation:
      "Card fees are visible; counting, banking and losing cash costs too — often more.",
  },
  {
    text: "A queue makes a shop look more appealing to passers-by.",
    isFact: true,
    explanation: "It's called social proof. A short queue reliably pulls people in.",
  },
  {
    text: "Most people decide whether to buy in the first few seconds of looking.",
    isFact: true,
    explanation: "First impressions do most of the work — which is why displays matter.",
  },
  {
    text: "Discounts are the best way to win a customer back.",
    isFact: false,
    explanation: "Being remembered beats being cheap. Regulars come back for treatment.",
  },
  {
    text: "Customers who complain are more loyal than the ones who go quiet.",
    isFact: true,
    explanation: "A complaint is a chance to fix it. Silence is usually goodbye.",
  },
  {
    text: "Free things and cheap things get treated exactly the same way.",
    isFact: false,
    explanation: "'Free' has its own pull — people take a free small over a cheap large.",
  },
  {
    text: "The busiest hour of most small shops is lunchtime.",
    isFact: true,
    explanation: "For most high-street trades, the midday hour outsells any other.",
  },
  {
    text: "A five-star review from a stranger sells more than a friend's word.",
    isFact: false,
    explanation: "A personal recommendation still beats any number of anonymous stars.",
  },
  {
    text: "Naming a price ending in 9 genuinely sells more than a round number.",
    isFact: true,
    explanation: "It reads as a smaller number. It is silly, and it works.",
  },
  {
    text: "Loyalty schemes only make sense for big chains.",
    isFact: false,
    explanation: "Small businesses see the bigger lift — you already know your regulars.",
  },
  {
    text: "Most customers who stop coming never say why.",
    isFact: true,
    explanation: "The vast majority simply drift. Nobody sends a farewell letter.",
  },
  {
    text: "Rainy days are always bad for a local shop.",
    isFact: false,
    explanation: "Passing trade dips, but deliveries and dwell-time spike. It nets out.",
  },
  {
    text: "Word of mouth is still how most small businesses get new customers.",
    isFact: true,
    explanation: "Being told about a place by someone you know beats every advert going.",
  },
  {
    text: "Playing music in a shop has no effect on how long people stay.",
    isFact: false,
    explanation: "Slower music, longer visits — it's one of the best-replicated findings there is.",
  },
  {
    text: "Handing someone something makes them more likely to buy it.",
    isFact: true,
    explanation: "Touch creates a sense of ownership before any money changes hands.",
  },
  {
    text: "A shorter menu usually sells more than a longer one.",
    isFact: true,
    explanation: "Too much choice stalls people. Fewer, better options close faster.",
  },
];

// ---------------------------------------------------------------------------
// Trade-specific myths, beyond the two or three each industry pack carries.
// ---------------------------------------------------------------------------

const TRADE_MYTHS: Record<string, MythStatement[]> = {
  restaurant: [
    { text: "Searing meat seals the juices in.", isFact: false, explanation: "It doesn't. It browns it — which is why it tastes better, not why it's juicy." },
    { text: "Adding oil to pasta water stops it sticking.", isFact: false, explanation: "The oil floats. Stirring is what works." },
    { text: "Resting meat after cooking genuinely makes it juicier.", isFact: true, explanation: "The juices redistribute instead of running out on the plate." },
    { text: "A sharp knife is safer than a blunt one.", isFact: true, explanation: "A blunt blade slips. A sharp one goes where you put it." },
    { text: "Alcohol completely cooks out of a sauce.", isFact: false, explanation: "Some always stays — even after a long simmer." },
  ],
  cafe: [
    { text: "Espresso is a roast, not a brewing method.", isFact: false, explanation: "It's a method — pressure and time. Any bean can be pulled as espresso." },
    { text: "Storing coffee in the freezer keeps it fresher.", isFact: false, explanation: "Moisture and odours get in. Airtight, cool and dark beats cold." },
    { text: "Milk steamed too hot tastes less sweet.", isFact: true, explanation: "Past about 65°C the sugars break down and it turns flat." },
    { text: "Decaf coffee has no caffeine at all.", isFact: false, explanation: "It has a little — around 2-3% of what it started with." },
    { text: "Water is over 98% of what's in your cup.", isFact: true, explanation: "Which is why bad water makes bad coffee, whatever the bean." },
  ],
  fashion: [
    { text: "Dry cleaning uses water.", isFact: false, explanation: "It uses solvent — that's the whole point of the name." },
    { text: "Cold washing is better for colours than hot.", isFact: true, explanation: "Heat is what pulls dye out of fibre." },
    { text: "Hanging knitwear keeps its shape.", isFact: false, explanation: "It stretches at the shoulders. Fold knits, always." },
    { text: "Natural fibres always outlast synthetic ones.", isFact: false, explanation: "A good polyester blend can outlast cotton by years." },
    { text: "Steaming kills more creases than ironing on delicate fabric.", isFact: true, explanation: "And it does it without pressing a shine into the cloth." },
  ],
  beauty: [
    { text: "Skin needs to 'breathe', so makeup at night causes damage.", isFact: false, explanation: "Skin takes its oxygen from blood, not air. Sleeping in makeup clogs pores — that's the real reason to remove it." },
    { text: "Higher SPF numbers give proportionally more protection.", isFact: false, explanation: "SPF 30 blocks ~97%, SPF 50 ~98%. Reapplying matters far more." },
    { text: "Hair damage cannot be repaired, only hidden.", isFact: true, explanation: "Hair isn't living tissue. Products smooth it; they don't heal it." },
    { text: "Trimming split ends stops them travelling up the strand.", isFact: true, explanation: "A split really does keep splitting if you leave it." },
    { text: "Oily skin doesn't need moisturiser.", isFact: false, explanation: "Skipping it usually makes the oil worse, not better." },
  ],
  grocery: [
    { text: "Frozen vegetables are less nutritious than fresh ones.", isFact: false, explanation: "They're frozen within hours of picking — often ahead of 'fresh' on nutrients." },
    { text: "Eggs keep better in the door of the fridge.", isFact: false, explanation: "The door is the warmest, most jostled shelf. Keep them in the body." },
    { text: "Bananas ripen everything stored next to them faster.", isFact: true, explanation: "They give off ethylene, which is the ripening signal." },
    { text: "Bread lasts longer in the fridge.", isFact: false, explanation: "Fridge temperatures stale bread faster than the counter. Freeze it instead." },
    { text: "Tinned food loses most of its nutrition in the tin.", isFact: false, explanation: "Very little changes after canning. It's a good pantry staple." },
  ],
  fitness: [
    { text: "Stretching before exercise prevents injury.", isFact: false, explanation: "Static stretching cold doesn't. A warm-up does." },
    { text: "Lifting weights makes most people bulky quickly.", isFact: false, explanation: "Building visible size takes years of deliberate work and eating." },
    { text: "Rest days are part of getting stronger, not a break from it.", isFact: true, explanation: "Muscle is built between sessions, not during them." },
    { text: "Sweating a lot means you burned more calories.", isFact: false, explanation: "Sweat tracks temperature, not effort." },
    { text: "Walking counts as real training.", isFact: true, explanation: "For heart health it's among the best-evidenced things there is." },
  ],
  pharmacy: [
    { text: "Vitamin C prevents colds.", isFact: false, explanation: "It may shorten one slightly. It doesn't stop you catching it." },
    { text: "Storing medicines in the bathroom is fine.", isFact: false, explanation: "Heat and damp are exactly what most of them shouldn't have." },
    { text: "Paracetamol and ibuprofen work in different ways.", isFact: true, explanation: "Different mechanisms — which is why they can be alternated." },
    { text: "Expiry dates on medicine are a formality.", isFact: false, explanation: "Potency really does fall away, and some drugs degrade badly." },
    { text: "Feeling better means the infection is gone.", isFact: false, explanation: "It's the usual reason people stop a course too early." },
  ],
  electronics: [
    { text: "Letting a battery run to 0% keeps it healthy.", isFact: false, explanation: "That was nickel batteries. Lithium prefers the middle of the range." },
    { text: "Turning a device off and on again genuinely fixes things.", isFact: true, explanation: "It clears bad state. It's the first thing any engineer tries." },
    { text: "A more expensive HDMI cable gives a better picture.", isFact: false, explanation: "The signal is digital. It arrives, or it doesn't." },
    { text: "Heat is the main thing that shortens a phone's life.", isFact: true, explanation: "It ages the battery faster than any number of charge cycles." },
    { text: "Closing background apps saves meaningful battery.", isFact: false, explanation: "Reopening them usually costs more than leaving them suspended." },
  ],
  services: [
    { text: "A job quoted cheapest is usually the one you pay twice for.", isFact: true, explanation: "The trade's oldest truth, and still the most reliable." },
    { text: "Duct tape is a permanent fix for a plumbing leak.", isFact: false, explanation: "It buys you an hour. That's the job it's good at." },
    { text: "Servicing something on a schedule costs less than repairing it.", isFact: true, explanation: "Almost always, and by a wide margin." },
    { text: "Booking a tradesperson at the weekend costs the same.", isFact: false, explanation: "Out-of-hours rates are standard practice, not a sting." },
    { text: "A written quote and an estimate mean the same thing.", isFact: false, explanation: "A quote is a price. An estimate is a guess." },
  ],
  other: [],
};

// ---------------------------------------------------------------------------
// The general trivia bank — unambiguous answers only.
// ---------------------------------------------------------------------------

const GENERAL_TRIVIA: TriviaQuestion[] = [
  { prompt: "How many minutes are there in a day?", options: ["1,440", "720", "2,400", "960"], answerIndex: 0 },
  { prompt: "Which of these is a citrus fruit?", options: ["Lime", "Mango", "Fig", "Plum"], answerIndex: 0 },
  { prompt: "What does 'BOGOF' stand for in retail?", options: ["Buy one get one free", "Best offer, good on Fridays", "Bulk order goes off first", "Buy on guarantee, order first"], answerIndex: 0 },
  { prompt: "Which comes first in the week?", options: ["Tuesday", "Thursday", "Saturday", "Sunday"], answerIndex: 0 },
  { prompt: "How many sides does a hexagon have?", options: ["6", "5", "7", "8"], answerIndex: 0 },
  { prompt: "What temperature does water boil at, at sea level?", options: ["100°C", "80°C", "120°C", "90°C"], answerIndex: 0 },
  { prompt: "Which of these is a payment card network?", options: ["Visa", "Vista", "Vespa", "Vosa"], answerIndex: 0 },
  { prompt: "How many hours are in three days?", options: ["72", "48", "60", "96"], answerIndex: 0 },
  { prompt: "Which is the largest?", options: ["A kilogram", "A gram", "A milligram", "A microgram"], answerIndex: 0 },
  { prompt: "What is 15% of 200?", options: ["30", "15", "25", "35"], answerIndex: 0 },
  { prompt: "Which of these is a leap year?", options: ["2024", "2023", "2022", "2021"], answerIndex: 0 },
  { prompt: "How many players are on a football pitch per side?", options: ["11", "9", "10", "12"], answerIndex: 0 },
  { prompt: "Which of these is a spice?", options: ["Cinnamon", "Cotton", "Cedar", "Copper"], answerIndex: 0 },
  { prompt: "What does 'VAT' stand for?", options: ["Value added tax", "Various added tariffs", "Verified account total", "Volume assessed tax"], answerIndex: 0 },
  { prompt: "How many months have 31 days?", options: ["7", "6", "5", "8"], answerIndex: 0 },
  { prompt: "Which is heaviest?", options: ["A tonne", "A stone", "A pound", "An ounce"], answerIndex: 0 },
  { prompt: "What's the next number: 2, 4, 8, 16…?", options: ["32", "24", "20", "18"], answerIndex: 0 },
  { prompt: "Which of these is a receipt usually printed on?", options: ["Thermal paper", "Canvas", "Vellum", "Foil"], answerIndex: 0 },
];

/** Product names from trades other than this one — safe wrong answers. */
function decoyProducts(industryKey: string | undefined, avoid: string[]): string[] {
  const taken = new Set(avoid.map((a) => a.toLowerCase()));
  return INDUSTRIES.filter((i) => i.key !== industryKey)
    .flatMap((i) => i.sellsExamples)
    .filter((name) => !taken.has(name.toLowerCase()));
}

const CITIES = [
  "Lagos", "Abuja", "Ibadan", "Port Harcourt", "Kano", "Benin City",
  "Enugu", "Kaduna", "Accra", "Nairobi",
];

const DAY_NAMES = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

/**
 * One question with the right answer shuffled out of first place.
 *
 * Distractors are deduped against the answer and each other: a generated
 * question that offers the same value twice is unanswerable, and one where a
 * distractor *equals* the answer is worse than unanswerable.
 */
function scrambled(
  prompt: string,
  answer: string,
  wrong: string[],
  rand: () => number = Math.random
): TriviaQuestion | null {
  const distinct: string[] = [];
  for (const candidate of wrong) {
    if (candidate === answer || distinct.includes(candidate)) continue;
    distinct.push(candidate);
    if (distinct.length === 3) break;
  }
  if (distinct.length < 2) return null;
  const options = shuffleWith([answer, ...distinct], rand);
  return { prompt, options, answerIndex: options.indexOf(answer) };
}

/**
 * Questions only this business's own customers can answer.
 *
 * `rand` is threaded through rather than reaching for Math.random so the
 * week's pool is genuinely the week's pool — same seed, same questions, same
 * option order, on every request.
 */
function businessTrivia(
  profile: BusinessProfile,
  businessName: string,
  rand: () => number = Math.random
): TriviaQuestion[] {
  const out: TriviaQuestion[] = [];
  const sells = (profile.sells ?? []).filter((s) => s.trim().length > 0);
  const decoys = decoyProducts(profile.industry, sells);

  for (const product of sells.slice(0, 3)) {
    const q = scrambled(
      `Which of these can you actually get at ${businessName}?`,
      product,
      shuffleWith(decoys, rand),
      rand
    );
    if (q) out.push(q);
  }

  if (profile.city) {
    const q = scrambled(
      `Which city is ${businessName} in?`,
      profile.city,
      shuffleWith(
        CITIES.filter((c) => c.toLowerCase() !== profile.city!.toLowerCase()),
        rand
      ),
      rand
    );
    if (q) out.push(q);
  }

  if (profile.busiestDay && DAY_NAMES.includes(profile.busiestDay)) {
    const q = scrambled(
      `Which day is ${businessName} busiest?`,
      profile.busiestDay,
      shuffleWith(DAY_NAMES.filter((d) => d !== profile.busiestDay), rand),
      rand
    );
    if (q) out.push(q);
  }

  const offers = (profile.offers ?? []).filter((o) => o.trim().length > 0);
  if (offers.length > 0) {
    const q = scrambled(
      `Which of these has ${businessName} actually given away?`,
      offers[0],
      shuffleWith(
        ["A brand new car", "A week in Dubai", "A season ticket", "A television"],
        rand
      ),
      rand
    );
    if (q) out.push(q);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Dealing a round
// ---------------------------------------------------------------------------

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item).trim().toLowerCase();
    if (k.length === 0 || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * A round of myth-vs-fact: everything the business wrote, then their trade's
 * myths, then the general bank — shuffled, and long enough that nobody
 * finishes the same quiz twice in a day.
 */
export function buildMythStatements(
  authored: unknown,
  profile: BusinessProfile,
  count = MYTH_ROUND_SIZE
): MythStatement[] {
  const own = (Array.isArray(authored) ? authored : [])
    .map((s) => {
      const row = s as Record<string, unknown>;
      return {
        text: String(row?.text ?? "").trim(),
        isFact: row?.isFact === true,
        explanation: String(row?.explanation ?? "").trim(),
      };
    })
    .filter((s) => s.text.length > 0);

  const pack = industryPack(profile.industry);
  const trade = [
    ...pack.mythFacts.map((m) => ({
      text: m.text,
      isFact: m.isFact,
      explanation: m.explanation,
    })),
    ...(TRADE_MYTHS[profile.industry ?? "other"] ?? []),
  ];

  const pool = dedupe([...own, ...shuffle(trade), ...shuffle(GENERAL_MYTHS)], (s) => s.text);

  // The business's own statements always make the cut; the rest of the round
  // is dealt at random from what's left.
  const mine = pool.filter((s) => own.some((o) => o.text === s.text));
  const rest = pool.filter((s) => !own.some((o) => o.text === s.text));
  return shuffle([...mine, ...rest.slice(0, Math.max(count - mine.length, 0))]);
}

/** How many questions a game's weekly pool holds at most. */
export const TRIVIA_POOL_SIZE = 250;

/**
 * A small deterministic PRNG, seeded from a string.
 *
 * The weekly pool has to be the *same* pool all week — a player who saw a
 * question on Monday should meet it again on Thursday, not get a fresh
 * universe every request — but it also has to differ from the next game's and
 * from next week's. Seeding on "game id + season number" gives exactly that,
 * with nothing stored.
 */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWith<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const naira = (amount: number) => `₦${amount.toLocaleString("en-NG")}`;

/**
 * Minted questions: arithmetic a shopkeeper's customer can do in their head,
 * with one unarguable answer and three near misses.
 *
 * Hand-writing 250 questions a week is not a thing anyone will do, and a bank
 * of 20 gets memorised by Tuesday. These generators mint as many as the pool
 * needs from parameters the seed picks, which keeps every week's quiz new
 * without anyone writing a word.
 */
function mintedQuestions(rand: () => number, want: number): TriviaQuestion[] {
  const out: TriviaQuestion[] = [];
  const seen = new Set<string>();
  const add = (prompt: string, answer: string, wrong: string[]) => {
    if (seen.has(prompt)) return;
    const question = scrambled(prompt, answer, wrong, rand);
    // A generated question whose distractors collided with the answer is
    // dropped rather than shipped ambiguous.
    if (!question) return;
    seen.add(prompt);
    out.push(question);
  };
  const pickInt = (min: number, max: number) =>
    min + Math.floor(rand() * (max - min + 1));

  // Each pass through the generators mints one of each kind.
  while (out.length < want) {
    const before = out.length;

    // Discount off a price.
    {
      const price = pickInt(2, 40) * 500;
      const off = [5, 10, 15, 20, 25, 50][pickInt(0, 5)];
      const pay = price - (price * off) / 100;
      add(
        `A ${naira(price)} item is ${off}% off. What do you pay?`,
        naira(pay),
        [
          naira(price - off),
          naira(pay + price * 0.05),
          naira(price / 2),
          naira(price),
        ]
      );
    }

    // Change from a note.
    {
      const price = pickInt(3, 19) * 250;
      const note = Math.ceil(price / 1000) * 1000 + 1000;
      add(
        `You pay ${naira(note)} for a ${naira(price)} order. What is your change?`,
        naira(note - price),
        [
          naira(note - price + 250),
          naira(note - price + 500),
          naira(price),
          naira(note),
        ]
      );
    }

    // Packs.
    {
      const per = pickInt(3, 12);
      const packs = pickInt(3, 12);
      add(
        `How many packs of ${per} make ${per * packs} items?`,
        `${packs}`,
        [`${packs + 1}`, `${packs - 1}`, `${packs + 2}`, `${packs * 2}`]
      );
    }

    // Opening hours.
    {
      const open = pickInt(6, 10);
      const close = pickInt(4, 10);
      const hours = 12 - open + close;
      add(
        `A shop opens at ${open}am and closes at ${close}pm. How many hours is it open?`,
        `${hours}`,
        [`${hours + 1}`, `${hours - 1}`, `${hours + 2}`, `${hours + 3}`]
      );
    }

    // Loyalty points.
    {
      const unit = [100, 200, 250, 500][pickInt(0, 3)];
      const points = pickInt(3, 20);
      add(
        `You earn 1 point per ${naira(unit)} spent. How many points for ${naira(unit * points)}?`,
        `${points}`,
        [`${points * 2}`, `${points + 1}`, `${points + 5}`, `${points * 10}`]
      );
    }

    // Doubling sequence.
    {
      const start = pickInt(1, 9);
      const seq = [start, start * 2, start * 4, start * 8];
      add(
        `What comes next: ${seq.join(", ")}…?`,
        `${start * 16}`,
        [`${start * 12}`, `${start * 10}`, `${start * 20}`, `${start * 24}`]
      );
    }

    // Units.
    {
      const kg = pickInt(2, 9);
      add(`How many grams are in ${kg}kg?`, `${kg * 1000}`, [
        `${kg * 100}`,
        `${kg * 10000}`,
        `${kg * 500}`,
        `${kg * 250}`,
      ]);
    }

    // Minutes.
    {
      const hrs = pickInt(2, 11);
      add(`How many minutes are in ${hrs} hours?`, `${hrs * 60}`, [
        `${hrs * 100}`,
        `${hrs * 30}`,
        `${hrs * 90}`,
        `${hrs * 45}`,
      ]);
    }

    // Splitting a bill.
    {
      const people = pickInt(2, 8);
      const each = pickInt(2, 12) * 250;
      add(
        `${people} friends split a ${naira(each * people)} bill evenly. What does each pay?`,
        naira(each),
        [naira(each + 250), naira(each * 2), naira(each - 250), naira(each + 500)]
      );
    }

    // Buy-one-get-one maths.
    {
      const unit = pickInt(2, 12) * 250;
      const bought = pickInt(2, 6) * 2;
      add(
        `Buy one get one free on a ${naira(unit)} item. What do ${bought} cost?`,
        naira((bought / 2) * unit),
        [
          naira(bought * unit),
          naira((bought / 2) * unit + unit),
          naira(unit),
          naira((bought / 2 + 1) * unit + unit),
        ]
      );
    }

    // Nothing new this pass (the parameters collided) — stop rather than spin.
    if (out.length === before) break;
  }
  return out.slice(0, want);
}

/**
 * This game's pool for this week: everything the business wrote, everything we
 * can say about them, the general bank, then minted questions up to
 * TRIVIA_POOL_SIZE. Stable for the whole season, different next season.
 */
export function buildTriviaPool(
  authored: TriviaQuestion[],
  profile: BusinessProfile,
  businessName: string,
  seed: string,
  size = TRIVIA_POOL_SIZE
): TriviaQuestion[] {
  const rand = seededRandom(seed);
  const known = dedupe(
    [
      ...authored,
      ...shuffleWith(businessTrivia(profile, businessName, rand), rand),
      ...shuffleWith(GENERAL_TRIVIA, rand),
    ],
    (q) => q.prompt
  );
  const minted = mintedQuestions(rand, Math.max(size - known.length, 0));
  return shuffleWith(dedupe([...known, ...minted], (q) => q.prompt), rand).slice(
    0,
    size
  );
}

/**
 * A round of trivia: the authored questions, then ones written from what we
 * know about the business, then general knowledge to fill.
 */
export function buildTriviaQuestions(
  authored: unknown,
  profile: BusinessProfile,
  businessName: string,
  /** Identifies the week — the pool is stable within it. */
  seed: string,
  count = TRIVIA_ROUND_SIZE
): TriviaQuestion[] {
  const own = (Array.isArray(authored) ? authored : [])
    .map((q) => {
      const row = q as Record<string, unknown>;
      const options = (Array.isArray(row?.options) ? row.options : [])
        .map((o) => String(o ?? "").trim())
        .filter((o) => o.length > 0);
      return {
        prompt: String(row?.prompt ?? "").trim(),
        options,
        // Authored questions are 1-indexed in the builder.
        answerIndex: Math.max(Math.round(Number(row?.answerIndex ?? 1)) - 1, 0),
      };
    })
    .filter((q) => q.prompt.length > 0 && q.options.length >= 2);

  // The week's pool, then this round's hand out of it. The business's own
  // questions are always in the hand; the rest is dealt at random, so two
  // plays an hour apart are two different quizzes out of the same 250.
  const pool = buildTriviaPool(own, profile, businessName, seed);
  const mine = own.filter((q) => pool.some((p) => p.prompt === q.prompt));
  const rest = pool.filter((q) => !own.some((o) => o.prompt === q.prompt));
  return shuffle([
    ...mine.slice(0, count),
    ...shuffle(rest).slice(0, Math.max(count - mine.length, 0)),
  ]);
}
