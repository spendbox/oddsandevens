/** Each pursuit carries a colour so it stays recognisable across the app. */
export const ACCENTS = {
  violet: { chip: 'bg-[#eef0ff] text-[#4a44c9]', bar: 'bg-[#5b53e8]', soft: 'bg-[#f6f5ff]' },
  emerald: { chip: 'bg-[#e9f7ef] text-[#15803d]', bar: 'bg-[#16a34a]', soft: 'bg-[#f2fbf5]' },
  amber: { chip: 'bg-[#fff4e5] text-[#b45309]', bar: 'bg-[#f59e0b]', soft: 'bg-[#fffaf1]' },
  rose: { chip: 'bg-[#fdeef4] text-[#be123c]', bar: 'bg-[#e11d48]', soft: 'bg-[#fff5f8]' },
  sky: { chip: 'bg-[#e9f5fd] text-[#0369a1]', bar: 'bg-[#0284c7]', soft: 'bg-[#f2f9fe]' },
  orange: { chip: 'bg-[#fff1e8] text-[#c2410c]', bar: 'bg-[#ea580c]', soft: 'bg-[#fff8f4]' },
} as const

export type AccentName = keyof typeof ACCENTS

export function accent(name: string) {
  return ACCENTS[(name as AccentName) in ACCENTS ? (name as AccentName) : 'violet']
}

export const CATEGORY_LABELS: Record<string, string> = {
  business: 'Building',
  skill: 'Learning',
  life: 'Exploring',
  health: 'Health',
  money: 'Money',
  creative: 'Creating',
  other: 'Pursuing',
}

export function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] ?? CATEGORY_LABELS.other
}
