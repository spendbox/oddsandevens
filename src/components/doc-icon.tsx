'use client'

import {
  Banknote,
  BookOpen,
  Briefcase,
  Calendar,
  Dumbbell,
  FileText,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Lightbulb,
  Mail,
  Megaphone,
  MapPin,
  Music,
  Phone,
  Receipt,
  ScrollText,
  ShoppingCart,
  Users,
  Utensils,
  Plane,
  ListChecks,
} from 'lucide-react'
import { iconFor, iconForTeam, type DocIcon as IconName } from '@/lib/doc-icon'
import type { Doc } from '@/lib/types'

/**
 * The picture beside a note's name.
 *
 * Which picture is decided in `lib/doc-icon.ts`, which is plain data and has a
 * test; this file is only the translation from a name to a glyph. The split is
 * the same one `kind.ts` makes, and for the same reason: the thing worth
 * testing is which icon a note gets, not which SVG the icon resolves to.
 */
const GLYPHS: Record<IconName, React.ComponentType<{ size?: number; className?: string }>> = {
  file: FileText,
  money: Banknote,
  receipt: Receipt,
  calendar: Calendar,
  people: Users,
  travel: Plane,
  home: House,
  contract: ScrollText,
  shopping: ShoppingCart,
  food: Utensils,
  health: HeartPulse,
  study: GraduationCap,
  work: Briefcase,
  tasks: ListChecks,
  idea: Lightbulb,
  journal: BookOpen,
  mail: Mail,
  campaign: Megaphone,
  place: MapPin,
  call: Phone,
  celebration: Gift,
  music: Music,
  fitness: Dumbbell,
}

/**
 * The picture for a team, from its name.
 *
 * It lives here rather than in the team screen so there is one map from a
 * name to a glyph in the whole app. Which icon a team gets is decided in
 * `lib/doc-icon.ts`, where it is data and has a test.
 */
export function TeamIcon({
  name,
  size = 15,
  className,
}: {
  name: string
  size?: number
  className?: string
}) {
  const Glyph = GLYPHS[iconForTeam(name)] ?? Users
  return <Glyph size={size} className={className} />
}

export default function DocIcon({
  doc,
  size = 15,
  className,
}: {
  doc: Doc
  size?: number
  className?: string
}) {
  const Glyph = GLYPHS[iconFor(doc)] ?? FileText
  return <Glyph size={size} className={className} />
}
