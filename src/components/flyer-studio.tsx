'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Download, Share2 } from 'lucide-react'
import { Button, Card } from './ui'
import { naira } from '@/lib/money'
import { drawFlyer, FLYER_STYLES, type FlyerData, type FlyerStyle } from '@/lib/flyers'
import type { Box } from '@/lib/types'

/**
 * Three flyers a creator can post anywhere.
 *
 * Drawn in the browser from the box as it is right now, which is what makes
 * "they update when you edit the box" true without any machinery: there is
 * nothing stored to go stale. Rename the box and the next time this page opens,
 * the flyers say the new name.
 *
 * The share sheet gets a real File, so on a phone this goes straight into
 * WhatsApp or Instagram rather than the camera roll. Where that is not
 * available — most desktop browsers — it falls back to a download.
 */
export function FlyerStudio({ box }: { box: Box }) {
  const canvases = useRef<Record<string, HTMLCanvasElement | null>>({})
  const [busy, setBusy] = useState<FlyerStyle | null>(null)

  // The site is reachable at more than one address, and the flyer should carry
  // the one the creator is actually looking at. Read through
  // useSyncExternalStore so the server and the first client render agree.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  )

  useEffect(() => {
    if (!origin) return

    const data: FlyerData = {
      code: box.code,
      title: box.title || `Box ${box.code}`,
      prize: naira(box.prize_naira),
      creator: box.creator_name || 'a player',
      url: `${origin}/b/${box.code}`,
    }

    for (const { style } of FLYER_STYLES) {
      const canvas = canvases.current[style]
      if (canvas) drawFlyer(canvas, style, data)
    }
  }, [box, origin])

  const fileFor = (style: FlyerStyle): Promise<File | null> =>
    new Promise((resolve) => {
      const canvas = canvases.current[style]
      if (!canvas) return resolve(null)

      canvas.toBlob((blob) => {
        if (!blob) return resolve(null)
        resolve(new File([blob], `spendbox-${box.code}-${style}.png`, { type: 'image/png' }))
      }, 'image/png')
    })

  const download = async (style: FlyerStyle) => {
    setBusy(style)
    const file = await fileFor(style)
    setBusy(null)
    if (!file) return

    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    // Revoked on the next tick: revoking immediately can cancel the download
    // in some browsers before it has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const share = async (style: FlyerStyle) => {
    setBusy(style)
    const file = await fileFor(style)
    setBusy(null)
    if (!file) return

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: box.title || `Box ${box.code}`,
          text: `Can you beat my box? ${naira(box.prize_naira)} says you cannot.`,
        })
        return
      } catch {
        // They backed out of the share sheet. Nothing to recover from.
        return
      }
    }

    await download(style)
  }

  return (
    <div>
      <div className="deck px-1">
        {FLYER_STYLES.map(({ style, name, note }) => (
          <Card key={style} className="animate-deal-in !p-4">
            <div className="overflow-hidden rounded-2xl bg-black/40 ring-1 ring-inset ring-white/10">
              <canvas
                ref={(node) => {
                  canvases.current[style] = node
                }}
                className="block aspect-square w-full"
                aria-label={`${name} flyer for box ${box.code}`}
                role="img"
              />
            </div>

            <p className="mt-3 font-semibold">{name}</p>
            <p className="mt-0.5 text-xs text-dusk">{note}</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                type="button"
                tone="gold"
                size="sm"
                disabled={busy === style}
                onClick={() => share(style)}
              >
                <Share2 size={15} /> Share
              </Button>
              <Button
                type="button"
                tone="ghost"
                size="sm"
                disabled={busy === style}
                onClick={() => download(style)}
              >
                <Download size={15} /> PNG
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <p className="mt-3 px-1 text-xs text-dusk">
        Swipe for more. These are made fresh every time you open this page, so they always
        show your box&apos;s current name and picture details.
      </p>
    </div>
  )
}
