"use client";

// Tile faces that don't depend on the player's device.
//
// The mahjong tiles were drawn with emoji, which is fine on a phone and a
// lottery everywhere else: an Android without the right font, a locked-down
// Windows, an older browser, and the tile shows a hollow box or a monochrome
// glyph instead of a picture. On a game where the whole task is *matching
// pictures*, that isn't cosmetic — a board of identical boxes is unplayable.
//
// So the faces are vector icons shipped with the app. The business still
// chooses its tiles with the emoji picker it already knows; each choice is
// mapped to the nearest icon here, and anything unmapped falls back to a
// shape rather than a box.

import { createElement } from "react";
import {
  Apple,
  Beef,
  Beer,
  Cake,
  Candy,
  Carrot,
  Cherry,
  Citrus,
  Coffee,
  Cookie,
  CroissantIcon,
  Croissant,
  Diamond,
  Dumbbell,
  Egg,
  Fish,
  Flower2,
  Gem,
  Gift,
  Grape,
  Hamburger,
  Heart,
  IceCream,
  IceCreamCone,
  Leaf,
  type LucideIcon,
  Milk,
  Pizza,
  Popcorn,
  Salad,
  Sandwich,
  Scissors,
  Shirt,
  ShoppingBag,
  Soup,
  Sparkles,
  Star,
  Ticket,
  Wine,
} from "lucide-react";

/** Emoji the picker offers -> the icon drawn on a tile. */
const BY_EMOJI: Record<string, LucideIcon> = {
  "🍕": Pizza,
  "🍔": Hamburger,
  "🌭": Sandwich,
  "🌮": Sandwich,
  "🌯": Sandwich,
  "🥙": Sandwich,
  "🥪": Sandwich,
  "🍗": Beef,
  "🍖": Beef,
  "🥩": Beef,
  "🍤": Fish,
  "🦐": Fish,
  "🍣": Fish,
  "🐠": Fish,
  "🍜": Soup,
  "🍲": Soup,
  "🍛": Soup,
  "🍚": Soup,
  "🥗": Salad,
  "🥦": Salad,
  "🥬": Salad,
  "🍝": Soup,
  "🍞": Croissant,
  "🥐": CroissantIcon,
  "🥖": Croissant,
  "🥯": Croissant,
  "🧇": Cake,
  "🥞": Cake,
  "🍰": Cake,
  "🎂": Cake,
  "🧁": Cake,
  "🍩": Cookie,
  "🍪": Cookie,
  "🍫": Candy,
  "🍬": Candy,
  "🍭": Candy,
  "🍦": IceCreamCone,
  "🍨": IceCream,
  "🥧": Cake,
  "🍯": Candy,
  "🍿": Popcorn,
  "☕": Coffee,
  "🍵": Coffee,
  "🥤": Milk,
  "🧃": Milk,
  "🧋": Milk,
  "🥛": Milk,
  "🍺": Beer,
  "🍻": Beer,
  "🍷": Wine,
  "🥂": Wine,
  "🍸": Wine,
  "🍹": Wine,
  "🥃": Wine,
  "🍾": Wine,
  "🍎": Apple,
  "🍏": Apple,
  "🍊": Citrus,
  "🍋": Citrus,
  "🍒": Cherry,
  "🍇": Grape,
  "🥕": Carrot,
  "🥚": Egg,
  "🍳": Egg,
  "🌸": Flower2,
  "🌻": Flower2,
  "🌹": Flower2,
  "🍀": Leaf,
  "🌿": Leaf,
  "👗": Shirt,
  "👕": Shirt,
  "👔": Shirt,
  "🛍️": ShoppingBag,
  "🛒": ShoppingBag,
  "✂️": Scissors,
  "💅": Sparkles,
  "💄": Sparkles,
  "🎁": Gift,
  "🎫": Ticket,
  "🎟️": Ticket,
  "💎": Gem,
  "⭐": Star,
  "🌟": Star,
  "✨": Sparkles,
  "❤️": Heart,
  "🏋️": Dumbbell,
  "💪": Dumbbell,
};

/** Icons used when a business hasn't chosen enough distinct tiles. */
const FALLBACKS: LucideIcon[] = [
  Star,
  Heart,
  Gem,
  Diamond,
  Leaf,
  Gift,
  Sparkles,
  Cherry,
];

/**
 * Draws the icon for a tile face.
 *
 * Built with `createElement` rather than `<Icon />`: the tag would be chosen
 * fresh on every render, which the compiler reads as a new component each
 * time. These icons are `forwardRef` objects, so they can't simply be called
 * either — only React knows how to render one.
 *
 * `index` keeps unmapped faces distinguishable: two unknown emoji must never
 * draw the same picture, or the board becomes unsolvable.
 */
export function TileFace({
  face,
  index,
  size,
}: {
  face: string;
  index: number;
  size: number;
}) {
  const Icon: LucideIcon = BY_EMOJI[face] ?? FALLBACKS[index % FALLBACKS.length];
  return createElement(Icon, {
    width: size,
    height: size,
    strokeWidth: 2.1,
    className: "text-emerald-900",
    "aria-hidden": true,
  });
}
