"use client";

// Icon slugs from the catalogue resolved to lucide components. Kept apart from
// the catalogue so server code can import game definitions without pulling in
// an icon library.

import {
  Bird,
  CalendarDays,
  Coins,
  Disc,
  Footprints,
  Gamepad2,
  Gem,
  GitFork,
  Gift,
  Grid2x2,
  Hammer,
  Layers,
  LayoutGrid,
  MapPin,
  Puzzle,
  Scale,
  Search,
  Shirt,
  ShoppingBasket,
  Sparkles,
  Sword,
  Trophy,
  X,
} from "lucide-react";
import type { ComponentType } from "react";

type IconProps = { className?: string; "aria-hidden"?: boolean };

const ICONS: Record<string, ComponentType<IconProps>> = {
  disc: Disc,
  coins: Coins,
  gift: Gift,
  "calendar-days": CalendarDays,
  footprints: Footprints,
  "shopping-basket": ShoppingBasket,
  sword: Sword,
  "grid-2x2": Grid2x2,
  sparkles: Sparkles,
  scale: Scale,
  "layout-grid": LayoutGrid,
  shirt: Shirt,
  trophy: Trophy,
  "map-pin": MapPin,
  "git-fork": GitFork,
  hammer: Hammer,
  gem: Gem,
  layers: Layers,
  bird: Bird,
  puzzle: Puzzle,
  search: Search,
  x: X,
};

export function GameIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  const Component = ICONS[icon] ?? Gamepad2;
  return <Component className={className} aria-hidden />;
}
