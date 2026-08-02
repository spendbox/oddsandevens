// The emoji a business can choose from when dressing a game.
//
// A curated, grouped, *named* set rather than a free-text box: typing emoji is
// awkward on a laptop, easy to get wrong (a pasted variation selector, an emoji
// the player's device can't render), and impossible to validate. Picking from a
// list is faster and can't produce something broken.
//
// Every entry carries a name so the picker can be searched — "coffee" finds ☕
// without anyone scrolling through twelve categories — and so a group can grow
// without becoming a haystack. Names are the words a shop owner would actually
// type, including the odd synonym ("soda" for 🥤, "trainers" for 👟).
//
// Only emoji that render as a single, recognisable glyph at 24px on every
// mainstream platform are in here. That rules out anything with a skin-tone or
// ZWJ sequence that degrades into two boxes on older Android, and anything so
// detailed it turns to mud at the size a falling-object game draws it.

export interface EmojiOption {
  char: string;
  /** Words someone might search for. The first is the label. */
  name: string;
}

export interface EmojiGroup {
  key: string;
  label: string;
  /** Shown on the group's tab, so the tabs are scannable at a glance. */
  icon: string;
  emoji: EmojiOption[];
}

const e = (char: string, name: string): EmojiOption => ({ char, name });

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    key: "food",
    label: "Food",
    icon: "🍔",
    emoji: [
      e("🍕", "pizza slice"), e("🍔", "burger hamburger"), e("🌭", "hot dog"),
      e("🌮", "taco"), e("🌯", "burrito wrap shawarma"), e("🥙", "pita gyro"),
      e("🍗", "chicken drumstick"), e("🍖", "meat bone"), e("🥩", "steak beef"),
      e("🍤", "prawn shrimp"), e("🦐", "shrimp seafood"), e("🍜", "noodles ramen"),
      e("🍲", "stew soup pot"), e("🍛", "curry rice"), e("🍚", "rice bowl"),
      e("🍣", "sushi"), e("🥟", "dumpling gyoza"), e("🥗", "salad greens"),
      e("🥪", "sandwich"), e("🍝", "pasta spaghetti"), e("🧆", "falafel"),
      e("🍞", "bread loaf"), e("🥐", "croissant"), e("🥖", "baguette"),
      e("🥯", "bagel"), e("🧇", "waffle"), e("🥞", "pancakes"),
      e("🧀", "cheese"), e("🥚", "egg"), e("🍳", "fried egg cooking"),
      e("🥓", "bacon"), e("🍟", "fries chips"), e("🥘", "paella pan"),
      e("🫓", "flatbread"), e("🍱", "bento lunchbox"), e("🥫", "canned tin"),
    ],
  },
  {
    key: "sweet",
    label: "Sweet",
    icon: "🍰",
    emoji: [
      e("🍰", "cake slice"), e("🎂", "birthday cake"), e("🧁", "cupcake"),
      e("🍩", "doughnut donut"), e("🍪", "cookie biscuit"), e("🍫", "chocolate bar"),
      e("🍬", "sweet candy"), e("🍭", "lollipop"), e("🍦", "ice cream cone"),
      e("🍨", "ice cream sundae"), e("🥧", "pie"), e("🍮", "custard flan"),
      e("🍯", "honey"), e("🍧", "shaved ice"), e("🥮", "mooncake"),
      e("🍡", "dango skewer"), e("🫖", "teapot"), e("🥜", "peanuts nuts"),
      e("🍿", "popcorn"), e("🧊", "ice cube"),
    ],
  },
  {
    key: "drink",
    label: "Drinks",
    icon: "☕",
    emoji: [
      e("☕", "coffee espresso hot drink"), e("🍵", "tea green"),
      e("🥤", "soft drink soda cup"), e("🧃", "juice box"),
      e("🧋", "bubble tea boba"), e("🍺", "beer pint"), e("🍻", "beers cheers"),
      e("🍷", "wine glass"), e("🥂", "champagne toast"), e("🍸", "cocktail martini"),
      e("🍹", "tropical drink"), e("🥃", "whisky tumbler"), e("🍾", "champagne bottle"),
      e("🥛", "milk glass"), e("🍶", "sake"), e("🧉", "mate"),
      e("🫗", "pouring drink"), e("💧", "water drop"),
    ],
  },
  {
    key: "fruit",
    label: "Fruit & veg",
    icon: "🍓",
    emoji: [
      e("🍎", "apple red"), e("🍏", "apple green"), e("🍊", "orange tangerine"),
      e("🍋", "lemon"), e("🍌", "banana"), e("🍉", "watermelon"),
      e("🍇", "grapes"), e("🍓", "strawberry"), e("🫐", "blueberries"),
      e("🍒", "cherries"), e("🍑", "peach"), e("🥭", "mango"),
      e("🍍", "pineapple"), e("🥥", "coconut"), e("🥝", "kiwi"),
      e("🍅", "tomato"), e("🥑", "avocado"), e("🥕", "carrot"),
      e("🌽", "corn maize"), e("🥦", "broccoli"), e("🌶️", "chilli pepper spicy"),
      e("🥔", "potato"), e("🧄", "garlic"), e("🧅", "onion"),
      e("🍆", "aubergine eggplant"), e("🥬", "leafy greens cabbage"),
      e("🫑", "bell pepper"), e("🍐", "pear"), e("🥒", "cucumber"),
      e("🍈", "melon"), e("🥭", "mango"), e("🌰", "chestnut"),
    ],
  },
  {
    key: "shopping",
    label: "Shop & style",
    icon: "🛍️",
    emoji: [
      e("👗", "dress"), e("👕", "t-shirt tee"), e("👔", "shirt tie"),
      e("👖", "jeans trousers"), e("🧥", "coat jacket"), e("👟", "trainers sneakers"),
      e("👠", "heels shoe"), e("👞", "shoe formal"), e("🥿", "flats shoe"),
      e("👜", "handbag"), e("🎒", "backpack"), e("🧢", "cap hat"),
      e("👒", "sun hat"), e("🕶️", "sunglasses"), e("💄", "lipstick makeup"),
      e("💅", "nails manicure"), e("💍", "ring jewellery"), e("⌚", "watch"),
      e("🧴", "lotion bottle skincare"), e("✂️", "scissors haircut"),
      e("🪮", "comb hair"), e("🛍️", "shopping bags"), e("🛒", "trolley cart"),
      e("🧺", "basket laundry"), e("📦", "box parcel"), e("🏷️", "price tag label"),
      e("💳", "card payment"), e("🧵", "thread sewing"), e("🧻", "tissue paper roll"),
      e("🧼", "soap"), e("🪞", "mirror"), e("👛", "purse"),
      e("🧳", "suitcase luggage"), e("🕰️", "clock vintage"), e("🪑", "chair furniture"),
    ],
  },
  {
    key: "tech",
    label: "Tech & tools",
    icon: "📱",
    emoji: [
      e("📱", "phone mobile"), e("💻", "laptop"), e("🖥️", "desktop monitor"),
      e("🎧", "headphones"), e("🔊", "speaker sound"), e("⌨️", "keyboard"),
      e("🖱️", "mouse"), e("📷", "camera"), e("🎮", "controller gaming"),
      e("🔌", "plug charger"), e("🔋", "battery"), e("💡", "lightbulb idea"),
      e("🔧", "spanner wrench"), e("🔨", "hammer"), e("🧰", "toolbox"),
      e("⚙️", "gear settings"), e("🪛", "screwdriver"), e("🧪", "test tube lab"),
      e("💊", "pill medicine"), e("🩺", "stethoscope doctor"), e("🌡️", "thermometer"),
      e("🩹", "plaster bandage"), e("🚿", "shower"), e("🤖", "robot"),
      e("🛠️", "tools repair"), e("🔦", "torch flashlight"), e("🖨️", "printer"),
      e("📡", "satellite signal"), e("💾", "disk save"), e("🧲", "magnet"),
    ],
  },
  {
    key: "animals",
    label: "Animals",
    icon: "🐶",
    emoji: [
      e("🐹", "hamster"), e("🐭", "mouse"), e("🐰", "rabbit bunny"),
      e("🐱", "cat"), e("🐶", "dog puppy"), e("🦊", "fox"),
      e("🐻", "bear"), e("🐼", "panda"), e("🐨", "koala"),
      e("🐯", "tiger"), e("🦁", "lion"), e("🐮", "cow"),
      e("🐷", "pig"), e("🐸", "frog"), e("🐵", "monkey"),
      e("🐔", "chicken hen"), e("🐤", "chick bird"), e("🦆", "duck"),
      e("🦉", "owl"), e("🦄", "unicorn"), e("🐝", "bee"),
      e("🐞", "ladybird beetle"), e("🦋", "butterfly"), e("🐢", "turtle"),
      e("🐙", "octopus"), e("🦀", "crab"), e("🐠", "fish tropical"),
      e("🐬", "dolphin"), e("🐳", "whale"), e("🦈", "shark"),
      e("🐧", "penguin"), e("🦩", "flamingo"), e("🐴", "horse"),
      e("🐘", "elephant"), e("🦒", "giraffe"), e("🐿️", "squirrel"),
    ],
  },
  {
    key: "people",
    label: "People",
    icon: "🏃",
    emoji: [
      e("🏃", "runner running"), e("🚶", "walking"), e("💃", "dancer"),
      e("🕺", "dancing man"), e("🧑‍🍳", "chef cook"), e("🧑‍⚕️", "doctor nurse"),
      e("🧑‍🔧", "mechanic engineer"), e("🧑‍🎨", "artist painter"),
      e("💇", "haircut salon"), e("🧘", "yoga meditation"), e("🏋️", "weights gym"),
      e("🚴", "cycling bike"), e("🤸", "cartwheel gymnast"), e("🤾", "handball throw"),
      e("🧗", "climbing"), e("🤹", "juggling"), e("🥊", "boxing glove"),
      e("💪", "muscle strong"), e("👋", "wave hello"), e("👍", "thumbs up"),
      e("🙌", "celebrate hands"), e("🤝", "handshake deal"), e("🧑‍💻", "developer office"),
      e("🏊", "swimming"), e("⛹️", "basketball player"), e("🤳", "selfie"),
    ],
  },
  {
    key: "symbols",
    label: "Prizes",
    icon: "🎁",
    emoji: [
      e("🎁", "gift present"), e("🏆", "trophy winner"), e("🥇", "gold medal first"),
      e("🥈", "silver medal second"), e("🥉", "bronze medal third"),
      e("🎖️", "medal honour"), e("⭐", "star"), e("🌟", "glowing star"),
      e("✨", "sparkles"), e("💎", "gem diamond"), e("👑", "crown"),
      e("🎉", "party popper"), e("🎊", "confetti"), e("🔥", "fire hot streak"),
      e("💯", "hundred perfect"), e("❤️", "heart love life"), e("💰", "money bag"),
      e("🪙", "coin"), e("💸", "cash flying"), e("🎫", "ticket voucher"),
      e("🏅", "medal sports"), e("🎯", "target bullseye"), e("🧧", "red envelope"),
      e("🎟️", "admission ticket"), e("💝", "gift heart"), e("🕶️", "cool"),
      e("🚀", "rocket launch"), e("📣", "megaphone shout"),
    ],
  },
  {
    key: "hazards",
    label: "Hazards",
    icon: "💣",
    emoji: [
      e("💣", "bomb"), e("💥", "explosion boom"), e("⚡", "lightning shock"),
      e("🌶️", "chilli spicy"), e("🧊", "ice cold"), e("🚫", "no entry banned"),
      e("⛔", "stop forbidden"), e("☠️", "skull danger"), e("🕳️", "hole pit"),
      e("🪨", "rock stone"), e("🌵", "cactus spikes"), e("🧱", "bricks wall"),
      e("⚠️", "warning caution"), e("🐍", "snake"), e("🦂", "scorpion"),
      e("🕷️", "spider"), e("⏰", "alarm clock time"), e("🪤", "trap"),
      e("🥊", "punch"), e("🧟", "zombie"), e("👻", "ghost"),
    ],
  },
  {
    key: "nature",
    label: "Nature",
    icon: "🌿",
    emoji: [
      e("🌵", "cactus"), e("🌲", "pine tree"), e("🌴", "palm tree"),
      e("🌸", "blossom flower"), e("🌻", "sunflower"), e("🌹", "rose"),
      e("🌿", "herb leaves"), e("🍀", "clover luck"), e("🍁", "maple leaf"),
      e("🌙", "moon night"), e("☀️", "sun sunny"), e("⛅", "cloudy"),
      e("🌈", "rainbow"), e("🌊", "wave sea"), e("❄️", "snowflake winter"),
      e("🎄", "christmas tree"), e("🎃", "pumpkin halloween"), e("🔆", "bright"),
      e("🌍", "earth globe"), e("🏝️", "island beach"), e("🌋", "volcano"),
      e("⛰️", "mountain"), e("🌱", "seedling growth"), e("🪴", "plant pot"),
    ],
  },
  {
    key: "marks",
    label: "Marks",
    icon: "✅",
    emoji: [
      e("❌", "cross wrong x"), e("⭕", "circle o"), e("✅", "tick correct check"),
      e("➕", "plus add"), e("➖", "minus subtract"), e("❓", "question"),
      e("❗", "exclamation"), e("🔵", "blue circle"), e("🔴", "red circle"),
      e("🟢", "green circle"), e("🟡", "yellow circle"), e("🟣", "purple circle"),
      e("🟠", "orange circle"), e("⬛", "black square"), e("⬜", "white square"),
      e("🔶", "orange diamond"), e("🔷", "blue diamond"), e("♠️", "spade"),
      e("♥️", "heart suit"), e("♦️", "diamond suit"), e("♣️", "club"),
    ],
  },
];

/** Every emoji the picker offers, for validating what comes back. */
export const ALLOWED_EMOJI: string[] = EMOJI_GROUPS.flatMap((g) =>
  g.emoji.map((o) => o.char)
);

const ALLOWED = new Set(ALLOWED_EMOJI);

export function isAllowedEmoji(value: string): boolean {
  return ALLOWED.has(value);
}

/** "🍕 🍔 🥤" -> ["🍕","🍔","🥤"], dropping anything not in the picker. */
export function parseEmojiSet(value: unknown): string[] {
  return String(value ?? "")
    .split(/\s+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && ALLOWED.has(e));
}

/**
 * Free-text search across every group. An empty query returns nothing, so the
 * picker can fall back to showing the open group rather than all 300 at once.
 */
export function searchEmoji(query: string, limit = 60): EmojiOption[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const out: EmojiOption[] = [];
  for (const group of EMOJI_GROUPS) {
    for (const option of group.emoji) {
      // A group's own name counts as a keyword: "drinks" finds the whole shelf.
      if (
        option.name.includes(q) ||
        group.label.toLowerCase().includes(q) ||
        option.char === q
      ) {
        if (!out.some((o) => o.char === option.char)) out.push(option);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}
