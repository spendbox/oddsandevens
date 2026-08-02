// The emoji a business can choose from when dressing a game.
//
// A curated, grouped set rather than a free-text box: typing emoji is awkward
// on a laptop, easy to get wrong (a pasted variation selector, an emoji the
// player's device can't render), and impossible to validate. Picking from a
// list is faster and can't produce something broken.

export interface EmojiGroup {
  key: string;
  label: string;
  emoji: string[];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    key: "food",
    label: "Food",
    emoji: [
      "🍕", "🍔", "🌭", "🌮", "🌯", "🥙", "🍗", "🍖", "🥩", "🍤",
      "🍜", "🍲", "🍛", "🍚", "🍣", "🥟", "🥗", "🥪", "🍝", "🧆",
      "🍞", "🥐", "🥖", "🥯", "🧇", "🥞", "🧀", "🥚", "🍳", "🥓",
    ],
  },
  {
    key: "sweet",
    label: "Sweet",
    emoji: [
      "🍰", "🎂", "🧁", "🍩", "🍪", "🍫", "🍬", "🍭", "🍦", "🍨",
      "🥧", "🍮", "🍯", "🍧", "🥮", "🍡",
    ],
  },
  {
    key: "drink",
    label: "Drinks",
    emoji: [
      "☕", "🍵", "🥤", "🧃", "🧋", "🍺", "🍻", "🍷", "🥂", "🍸",
      "🍹", "🥃", "🍾", "🧊", "🥛", "🍶",
    ],
  },
  {
    key: "fruit",
    label: "Fruit & veg",
    emoji: [
      "🍎", "🍏", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍒",
      "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🥕", "🌽", "🥦",
      "🌶️", "🥔", "🧄", "🧅",
    ],
  },
  {
    key: "shopping",
    label: "Shop & style",
    emoji: [
      "👗", "👕", "👔", "👖", "🧥", "👟", "👠", "👜", "🎒", "🧢",
      "🕶️", "💄", "💅", "💍", "⌚", "🧴", "✂️", "🪮", "🛍️", "🛒",
      "🧺", "📦", "🏷️", "💳", "🧵", "🧻", "🧼",
    ],
  },
  {
    key: "tech",
    label: "Tech & tools",
    emoji: [
      "📱", "💻", "🖥️", "🎧", "⌨️", "🖱️", "📷", "🎮", "🔌", "🔋",
      "💡", "🔧", "🔨", "🧰", "⚙️", "🪛", "🧪", "💊", "🩺", "🌡️",
      "🩹", "🚿", "🤖",
    ],
  },
  {
    key: "animals",
    label: "Animals",
    emoji: [
      "🐹", "🐭", "🐰", "🐱", "🐶", "🦊", "🐻", "🐼", "🐨", "🐯",
      "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐤", "🦆", "🦉", "🦄",
      "🐝", "🐞", "🦋", "🐢", "🐙", "🦀", "🐠", "🐬",
    ],
  },
  {
    key: "people",
    label: "People",
    emoji: [
      "🏃", "🚶", "💃", "🕺", "🧑‍🍳", "🧑‍⚕️", "🧑‍🔧", "🧑‍🎨", "💇", "🧘",
      "🏋️", "🚴", "🤸", "🤾", "🧗", "🤹", "🥊", "💪",
    ],
  },
  {
    key: "symbols",
    label: "Prizes & symbols",
    emoji: [
      "🎁", "🏆", "🥇", "🥈", "🥉", "⭐", "🌟", "✨", "💎", "👑",
      "🎉", "🎊", "🔥", "💯", "❤️", "💰", "🪙", "🎫", "🏅", "🎯", "💸",
    ],
  },
  {
    key: "hazards",
    label: "Hazards",
    emoji: [
      "💣", "💥", "⚡", "🌶️", "🧊", "🚫", "⛔", "☠️", "🕳️", "🪨",
      "🌵", "🧱", "⚠️", "🐍", "🦂", "🕷️", "⏰",
    ],
  },
  {
    key: "nature",
    label: "Nature",
    emoji: [
      "🌵", "🌲", "🌴", "🌸", "🌻", "🍀", "🍁", "🌙", "☀️", "⛅",
      "🌈", "🌊", "🔆", "❄️", "🎄", "🎃",
    ],
  },
  {
    key: "marks",
    label: "Marks",
    emoji: ["❌", "⭕", "✅", "➕", "➖", "🔵", "🔴", "🟢", "🟡", "🟣"],
  },
];

/** Every emoji the picker offers, for validating what comes back. */
export const ALLOWED_EMOJI: string[] = EMOJI_GROUPS.flatMap((g) => g.emoji);

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
