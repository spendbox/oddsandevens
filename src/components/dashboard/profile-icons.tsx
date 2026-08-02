"use client";

// Icons for the settings chips.
//
// These used to be emoji. Emoji are right inside a *game*, where the business
// picks them and the player sees them — they're the artwork. They are wrong in
// a settings form, where they render differently on every device, sit at a
// different baseline from the label beside them, and make a dashboard look
// like a group chat.

import {
  BarChart3,
  Coffee,
  Dumbbell,
  Footprints,
  Gem,
  HeartHandshake,
  type LucideIcon,
  Megaphone,
  PartyPopper,
  Pill,
  Repeat,
  Rocket,
  Scissors,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Store,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "utensils-crossed": UtensilsCrossed,
  coffee: Coffee,
  shirt: Shirt,
  scissors: Scissors,
  "shopping-basket": ShoppingBasket,
  dumbbell: Dumbbell,
  pill: Pill,
  smartphone: Smartphone,
  wrench: Wrench,
  store: Store,
  repeat: Repeat,
  footprints: Footprints,
  rocket: Rocket,
  megaphone: Megaphone,
  "bar-chart-3": BarChart3,
  "party-popper": PartyPopper,
  "heart-handshake": HeartHandshake,
  gem: Gem,
};

export function ProfileIcon({
  icon,
  className = "size-4",
}: {
  icon: string;
  className?: string;
}) {
  const Component = ICONS[icon] ?? Store;
  return <Component className={className} aria-hidden />;
}
