// Curated icon set businesses can pick from to represent a reward. The slug
// is what's stored in the DB (validated against REWARD_ICON_SLUGS in
// constants.ts); this module maps slugs to lucide components for the UI.

import {
  BadgePercent,
  Beer,
  CakeSlice,
  Car,
  Coffee,
  Croissant,
  CupSoda,
  Drumstick,
  Dumbbell,
  Gem,
  Gift,
  Heart,
  IceCreamCone,
  Music,
  Pizza,
  Salad,
  Sandwich,
  Scissors,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  Ticket,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { RewardIconSlug } from "./constants";

export const REWARD_ICON_COMPONENTS: Record<RewardIconSlug, LucideIcon> = {
  gift: Gift,
  percent: BadgePercent,
  ticket: Ticket,
  star: Star,
  sparkles: Sparkles,
  heart: Heart,
  gem: Gem,
  coffee: Coffee,
  pizza: Pizza,
  sandwich: Sandwich,
  croissant: Croissant,
  salad: Salad,
  drumstick: Drumstick,
  "ice-cream": IceCreamCone,
  cake: CakeSlice,
  drink: CupSoda,
  beer: Beer,
  utensils: Utensils,
  shirt: Shirt,
  bag: ShoppingBag,
  scissors: Scissors,
  music: Music,
  car: Car,
  dumbbell: Dumbbell,
  phone: Smartphone,
};

// The Gift fallback keeps unset / legacy rewards looking right.
export function rewardIcon(slug: string | null | undefined): LucideIcon {
  return REWARD_ICON_COMPONENTS[slug as RewardIconSlug] ?? Gift;
}
