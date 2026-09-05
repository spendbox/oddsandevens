import type { Profile } from '@/lib/types'

/* Nobody has uploaded a photo on day one, and grey silhouettes make a network
   look dead. Initials on a colour derived from the person's id give every
   member a stable, recognisable mark from the moment they sign up. */
const TONES = [
  'bg-[#eef0ff] text-[#4a44c9]',
  'bg-[#e9f7ef] text-[#15803d]',
  'bg-[#fff2e8] text-[#c2410c]',
  'bg-[#fdeef4] text-[#be123c]',
  'bg-[#e9f5fd] text-[#0369a1]',
  'bg-[#f4eefd] text-[#7c3aed]',
  'bg-[#fdf6e3] text-[#a16207]',
]

function initials(name: string, handle: string) {
  const source = name.trim() || handle
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function tone(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 9973
  return TONES[hash % TONES.length]
}

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
}

export function Avatar({
  profile,
  size = 'md',
  className = '',
}: {
  profile: Pick<Profile, 'id' | 'full_name' | 'handle' | 'avatar_url'>
  size?: keyof typeof SIZES
  className?: string
}) {
  if (profile.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.avatar_url}
        alt={profile.full_name || profile.handle}
        className={`${SIZES[size]} shrink-0 rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={`${SIZES[size]} ${tone(profile.id)} flex shrink-0 items-center justify-center rounded-full font-semibold ${className}`}
    >
      {initials(profile.full_name, profile.handle)}
    </span>
  )
}
