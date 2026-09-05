'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { SearchIcon } from '@/components/icons'

export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initial)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        router.push(value.trim() ? `/discover?q=${encodeURIComponent(value.trim())}` : '/discover')
      }}
      className="relative"
    >
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint">
        <SearchIcon size={16} />
      </span>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Build a profitable SaaS company…"
        aria-label="Search pursuits and people"
        className="field py-2.5 pl-10"
      />
    </form>
  )
}
