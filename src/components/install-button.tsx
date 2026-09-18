'use client'

import { Download, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { askToInstall, useInstall } from '@/lib/install'

/**
 * Install: the one button in this app that is about the app.
 *
 * ## Why it exists when the browser has its own
 *
 * Because the browser's own is a 16-pixel icon at the far end of the address
 * bar that most people have never looked at, and on a phone there is no icon
 * at all — it is two taps inside the Share menu. A note-taking app that opens
 * from the home screen with no address bar, holds its notes on the device and
 * starts with no network is a different thing from a tab somebody has to find
 * again, and nobody gets that if nobody presses install.
 *
 * ## Why it is nearly always absent
 *
 * It appears only when there is something to do: a browser that has offered
 * the install, or an iPhone, where the two steps have to be described because
 * there is nothing to offer. Once the app is installed it is gone for good,
 * and a browser that has been asked and refused does not hand over a second
 * offer, so it goes then too. Anything that would still be sitting in the bar
 * after somebody has said no is furniture.
 */
export default function InstallButton() {
  const state = useInstall()
  const [showing, setShowing] = useState(false)
  const bubble = useRef<HTMLDivElement>(null)

  /*
    The iOS instruction closes on a press outside it, tested by where the
    press landed rather than by stopping propagation — the rule every other
    panel in this app follows, and for the same reason: propagation closes it
    on pointerdown and unmounts the thing that was about to be clicked.
  */
  useEffect(() => {
    if (!showing) return
    const away = (event: Event) => {
      const el = event.target as Element | null
      if (el && bubble.current?.contains(el)) return
      setShowing(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowing(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', onKey)
    }
  }, [showing])

  if (state === 'none' || state === 'installed') return null

  const manual = state === 'manual'

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          if (manual) setShowing((on) => !on)
          else void askToInstall()
        }}
        aria-label="Install Pad as an app"
        title="Install Pad as an app"
        className="flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[13px] text-[var(--color-muted)] hover:border-[var(--color-faint)] hover:text-[var(--color-ink)]"
      >
        <Download size={14} />
        {/* The word is for a desktop, where there is room for it. On a phone
            the icon alone is the whole button, because the bar it sits in
            also holds a name and an account. */}
        <span className="hidden sm:inline">Install</span>
      </button>

      {/*
        What an iPhone needs instead of a prompt: the two taps, named. It is
        not a dialog — there is nothing to decide, and a modal over the notes
        to say one sentence is out of proportion to it.
      */}
      {showing && manual && (
        <div
          ref={bubble}
          role="status"
          className="absolute top-full right-0 z-50 mt-1 w-64 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-3 shadow-xl"
        >
          <button
            type="button"
            onClick={() => setShowing(false)}
            aria-label="Close"
            className="float-right -mt-1 -mr-1 flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <X size={15} />
          </button>
          <p className="text-[13px] font-medium">Add Pad to your home screen</p>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-muted)]">
            Press <span className="font-medium text-[var(--color-ink)]">Share</span> at the bottom
            of the browser, then{' '}
            <span className="font-medium text-[var(--color-ink)]">Add to Home Screen</span>. It
            then opens like any other app, and works with no signal.
          </p>
        </div>
      )}
    </div>
  )
}
