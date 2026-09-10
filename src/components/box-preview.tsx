'use client'

import Image from 'next/image'
import { Lock, Unlock, Zap } from 'lucide-react'
import { Pill } from './ui'
import { TileReel } from './tile-reel'
import { COINS_PER_PLAY, naira, priceLabel } from '@/lib/money'
import type { Box } from '@/lib/types'

/**
 * What the box looks like to somebody who opens the link.
 *
 * Shown while editing, live, from the values in the form. A creator writing a
 * description has no other way to know whether it reads well at the size it
 * will actually be seen, or whether their picture is cropped somewhere unkind.
 *
 * Deliberately a scaled-down likeness rather than the page itself: it has to
 * sit inside a form on a phone, and an iframe of the real page would be both
 * slow and unreadable at that size.
 */
export function BoxPreview({
  box,
  title,
  description,
  imageUrl,
}: {
  box: Box
  title: string
  description: string
  imageUrl: string
}) {
  const isOpen = box.status === 'open'

  return (
    <div className="overflow-hidden rounded-3xl bg-ink ring-1 ring-white/10">
      {imageUrl ? (
        <div className="relative h-28 w-full">
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 32rem"
            className="object-cover"
            unoptimized
          />
          <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/30 to-transparent" />
        </div>
      ) : null}

      <div className="px-5 pt-4 pb-6 text-center">
        <Pill tone={isOpen ? 'lime' : 'quiet'}>
          {isOpen ? <Unlock size={12} /> : <Lock size={12} />}
          {isOpen ? 'Open' : 'Won'} · Box {box.code}
        </Pill>

        <div className="mt-4 scale-90">
          <TileReel amount={box.prize_naira} dim={!isOpen} />
        </div>

        <h3 className="mt-2 text-lg font-bold tracking-tight">
          {title.trim() || `Box ${box.code}`}
        </h3>
        <p className="mt-0.5 text-xs text-dusk">by {box.creator_name || 'you'}</p>

        {description.trim() ? (
          <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-mist">
            {description.trim()}
          </p>
        ) : (
          <p className="mx-auto mt-3 max-w-xs text-sm text-dusk italic">
            No description yet — this space is where you talk people into trying.
          </p>
        )}

        <div className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-linear-to-b from-gold to-[#e8a615] px-5 py-2.5 text-sm font-semibold text-ink">
          <Zap size={15} /> Play · {priceLabel(COINS_PER_PLAY).toLowerCase()}
        </div>

        <p className="mt-3 text-[11px] text-dusk">
          Clear all 10 patterns and {naira(box.prize_naira)} is yours
        </p>
      </div>
    </div>
  )
}
