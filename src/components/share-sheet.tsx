'use client'

import { Check, Copy, Globe2, Link2, Link2Off, LoaderCircle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useName } from '@/lib/profile'
import { publishDoc, shareState, unpublishDoc } from '@/lib/share'
import type { Doc } from '@/lib/types'

/**
 * Sharing a note: the link, and the World.
 *
 * ## Why this is a popup and not more rows in the ⋯
 *
 * Because it was rows in the ⋯, and listing a note in the World was a
 * checkbox that only appeared *after* a link had been made — so the way to
 * put a note in the World was to press something that does not mention the
 * World, and then find a tickbox that was not there a moment ago. Nobody
 * found it, which is the same as it not existing.
 *
 * It is one panel now, opened from the menu, holding both answers to the one
 * question somebody has: who can see this. A press outside closes it, because
 * that is what a press outside means everywhere else in this app.
 *
 * ## Two choices, not one with a switch hidden inside it
 *
 * A link goes to particular people. A listing is left where anybody can find
 * it. Each has its own row, its own sentence about who can see it, and
 * turning either on does the whole job in one press — including publishing
 * the note in the first place, which is why the World no longer waits for a
 * link to exist.
 *
 * Turning the listing off leaves the link working for whoever already has it;
 * **Stop sharing** takes down both, and is the only thing here that can lose
 * somebody else's access.
 */
export default function ShareSheet({
  doc,
  accountId,
  onClose,
}: {
  doc: Doc
  /** Null when nobody is signed in, which is what sharing requires. */
  accountId: string | null
  onClose: () => void
}) {
  /*
    What a shared copy is credited to: the name they call themselves in this
    app, which lives on the device beside the theme. The account knows an
    email address, and nobody wants their email address on a note in the
    World.
  */
  const { name } = useName()
  const [url, setUrl] = useState<string | null>(null)
  const [listed, setListed] = useState(false)
  const [busy, setBusy] = useState(!!accountId)
  const [problem, setProblem] = useState<string | undefined>()
  const [copied, setCopied] = useState(false)
  const panel = useRef<HTMLDivElement>(null)

  // What is already true of this note, asked once when the panel opens.
  useEffect(() => {
    if (!accountId) return
    let cancelled = false
    void (async () => {
      const state = await shareState(doc.id, accountId)
      if (cancelled) return
      setUrl(state.url)
      setListed(state.listed)
      setBusy(false)
    })()
    return () => {
      cancelled = true
    }
  }, [accountId, doc.id])

  /*
    Closed by testing where the press landed, never by stopPropagation:
    relying on propagation closes a panel on pointerdown and unmounts the
    button before its own click can fire, which is how every control inside
    one ends up doing nothing.
  */
  useEffect(() => {
    const away = (event: Event) => {
      const el = event.target as Element | null
      if (el && panel.current?.contains(el)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  /**
   * Publishes, or republishes, with whatever the listing should now be.
   *
   * One path for both rows, because "share a link" and "put it in the World"
   * are the same write with one flag different — and because a note that has
   * never been shared has to be publishable straight into the World without
   * anybody pressing something else first.
   */
  const publish = async (next: boolean) => {
    if (!accountId || busy) return
    setBusy(true)
    setProblem(undefined)
    const result = await publishDoc(doc, accountId, { listed: next, author: name })
    setBusy(false)
    if (!result.ok) {
      setProblem(result.problem)
      return
    }
    setUrl(result.url ?? url)
    setListed(next)
  }

  const stop = async () => {
    if (!accountId || busy) return
    setBusy(true)
    await unpublishDoc(doc.id, accountId)
    setBusy(false)
    setUrl(null)
    setListed(false)
  }

  const copy = () => {
    navigator.clipboard?.writeText(url ?? '').then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => {
        // Clipboard access can be refused. The link is on screen and
        // selectable, so this is not a dead end.
      },
    )
  }

  return (
    <>
      {/*
        The overlay is what a press outside lands on, and it says so to a
        screen reader. The pointerdown listener above catches the rest of the
        window, including the bar this was opened from.
      */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/25"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[60] flex justify-center p-2 sm:inset-y-0 sm:items-center"
      >
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-label="Share this note"
          className="w-full max-w-md rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] p-3 shadow-2xl"
        >
          <div className="mb-2 flex items-center gap-2">
            <p className="text-[14px] font-medium">Share this note</p>
            {busy && <LoaderCircle size={14} className="animate-spin text-[var(--color-faint)]" />}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              <X size={18} />
            </button>
          </div>

          {/*
            Both choices are on screen even with nobody signed in, greyed
            out under the sentence that says why. Hiding them would answer
            "what does sharing do here" with an empty panel, and the two
            lines under them are the answer.
          */}
          {!accountId && (
            <p className="mb-1 rounded-xl bg-[var(--color-hover)] p-3 text-[13px] text-[var(--color-muted)]">
              Sharing needs an account, so the copy has somewhere to live. Sign in at the top of
              your notes.
            </p>
          )}

          <Choice
            icon={<Link2 size={16} />}
            label="Anyone with the link"
            hint="A read-only copy at an address you send to people"
            on={!!url}
            busy={busy || !accountId}
            onToggle={(next) => (next ? void publish(listed) : void stop())}
          />
          <Choice
            icon={<Globe2 size={16} />}
            label="In the World"
            hint="Anyone can find it there, search it and save a copy"
            on={listed}
            busy={busy || !accountId}
            onToggle={(next) => void publish(next)}
          />

          {accountId && (
            <>
              {url && (
                <div className="mt-2 flex items-center gap-1">
                  <input
                    readOnly
                    value={url}
                    aria-label="Share link"
                    onFocus={(event) => event.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] px-2 py-1.5 text-[12px] outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Copy link"
                    onClick={copy}
                    className="shrink-0 rounded-lg p-2 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
                  >
                    {copied ? (
                      <Check size={15} className="text-[var(--color-good)]" />
                    ) : (
                      <Copy size={15} />
                    )}
                  </button>
                </div>
              )}

              {url && (
                <div className="mt-1 flex items-center gap-1">
                  {/*
                    A shared copy is a snapshot, so what somebody else reads
                    is what the note said when it was published. This is how
                    it catches up, and it is a press rather than automatic:
                    editing a note must not silently change what a link
                    somebody already has shows them.
                  */}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void publish(listed)}
                    className="rounded-md px-2 py-1.5 text-[12px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] disabled:opacity-50"
                  >
                    Update the shared copy
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void stop()}
                    className="ml-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-danger)] disabled:opacity-50"
                  >
                    <Link2Off size={12} /> Stop sharing
                  </button>
                </div>
              )}
            </>
          )}

          {problem && (
            <p role="status" className="mt-2 text-[12px] text-[var(--color-danger)]">
              {problem}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * One answer to "who can see this", as a row with a switch.
 *
 * A switch rather than a button that changes its own label, because the
 * question here is a state — who can see it now — and a label that reads
 * "Stop sharing" makes somebody work out what is true from what they are
 * being offered.
 */
function Choice({
  icon,
  label,
  hint,
  on,
  busy,
  onToggle,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  on: boolean
  busy: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => onToggle(!on)}
      className="flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left hover:bg-[var(--color-hover)] disabled:opacity-60"
    >
      <span className={`mt-0.5 shrink-0 ${on ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{label}</span>
        <span className="block text-[12px] text-[var(--color-faint)]">{hint}</span>
      </span>
      {/* The switch itself: drawn rather than an <input>, so it matches the
          rest of the app and carries its own state to a screen reader. */}
      <span
        aria-hidden
        className={`mt-1 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          on ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-line)]'
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white transition-transform ${
            on ? 'translate-x-4' : ''
          }`}
        />
      </span>
    </button>
  )
}
