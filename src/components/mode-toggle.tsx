'use client'

import { Users, User } from 'lucide-react'
import { useMode } from '@/lib/mode'

/**
 * Mine, or the team's.
 *
 * Two words in a pill, because that is what a mode is: you are in one of
 * them and you can see which. It is the only control in this app that
 * changes what the whole screen is for, so it sits at the top, it is always
 * visible, and it never hides what it does behind an icon on its own.
 *
 * Nothing moves between the two. Pressing Team does not share a note, copy
 * one, or show anybody anything of yours — it opens a different screen. That
 * is worth being sure of before pressing, which is why the labels are words.
 */
export default function ModeToggle() {
  const { mode, set } = useMode()
  return (
    <div
      role="tablist"
      aria-label="Mine or the team's"
      className="flex shrink-0 items-center rounded-full bg-[var(--color-hover)] p-0.5"
    >
      <Side on={mode === 'mine'} onPress={() => set('mine')} icon={<User size={13} />} label="Mine" />
      <Side on={mode === 'team'} onPress={() => set('team')} icon={<Users size={13} />} label="Team" />
    </div>
  )
}

function Side({
  on,
  onPress,
  icon,
  label,
}: {
  on: boolean
  onPress: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onPress}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] ${
        on
          ? 'bg-[var(--color-paper)] font-medium text-[var(--color-ink)] shadow-sm'
          : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
