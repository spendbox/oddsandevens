'use client'

import { useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui'

/** Nothing to subscribe to: the origin does not change while the page is open. */
const noSubscribe = () => () => {}

/**
 * The site's own address, read from the browser.
 *
 * It is not passed in from the server because the site can be reached at more
 * than one address — a Vercel preview, a custom domain — and the link somebody
 * shares should be the one they are looking at. useSyncExternalStore is how you
 * read a browser-only value without the server and the client disagreeing about
 * the first render: the server gets '' and the browser fills it in.
 */
function useOrigin(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => '',
  )
}

export function ShareLink({ code, title }: { code: string; title: string }) {
  const origin = useOrigin()
  const [copied, setCopied] = useState(false)

  const url = `${origin}/b/${code}`

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: 'Can you beat this box?', url })
        return
      } catch {
        // They backed out of the share sheet. Fall through and copy instead.
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1 rounded-2xl bg-black/35 px-4 py-3 ring-1 ring-inset ring-white/10">
        <p className="truncate font-mono text-sm text-mist">{origin ? url : `/b/${code}`}</p>
      </div>
      <Button type="button" tone="ghost" onClick={share} className="shrink-0">
        {copied ? '✓ Copied' : 'Share link'}
      </Button>
    </div>
  )
}
