'use client'

import { Check, CloudOff, LoaderCircle, LogOut, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getSupabase, isSyncConfigured } from '@/lib/supabase'
import type { SyncState } from '@/lib/sync'

/**
 * The sign-in control, top right.
 *
 * The important thing about it is what it does not do: nothing in this app
 * waits for it. Signing in adds a copy on the server so a second device can
 * catch up, and signing out leaves every document exactly where it was. The
 * button is an upgrade, never a gate — which is why it is a small corner
 * control and not a screen you meet first.
 */
export interface Account {
  id: string
  email: string
}

export default function AccountButton({
  account,
  syncState,
  onSignedIn,
  onSignedOut,
  onSyncNow,
}: {
  account: Account | null
  syncState: SyncState
  onSignedIn: (account: Account) => void
  onSignedOut: () => void
  onSyncNow: () => void
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Sync being unconfigured is a normal state, not a broken one, so it gets a
  // plain explanation rather than an error.
  if (!isSyncConfigured()) {
    return (
      <div
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] text-[var(--color-faint)]"
        title="Everything is saved in this browser. Sync is not set up on this deployment."
      >
        <CloudOff size={13} />
        <span className="hidden sm:inline">On this device</span>
      </div>
    )
  }

  const submit = async () => {
    setBusy(true)
    setMessage(null)
    setNotice(null)
    try {
      const db = await getSupabase()
      if (!db) {
        setMessage('Sign-in is unavailable right now. Your work is saved here.')
        return
      }
      if (mode === 'up') {
        const { data, error } = await db.auth.signUp({ email, password })
        if (error) {
          setMessage(error.message)
        } else if (data.session && data.user) {
          onSignedIn({ id: data.user.id, email: data.user.email ?? email })
          setOpen(false)
          setPassword('')
        } else {
          // Supabase is configured to confirm addresses, so there is no
          // session yet. Saying so beats a form that appears to do nothing.
          setNotice('Check your email to confirm the address, then sign in.')
          setMode('in')
          setPassword('')
        }
      } else {
        const { data, error } = await db.auth.signInWithPassword({ email, password })
        if (error) setMessage(error.message)
        else if (data.user) {
          onSignedIn({ id: data.user.id, email: data.user.email ?? email })
          setOpen(false)
          setPassword('')
        }
      }
    } catch {
      setMessage('Could not reach the server. Your work is still saved here.')
    } finally {
      setBusy(false)
    }
  }

  if (account) {
    const initial = account.email.trim().charAt(0).toUpperCase() || '?'
    return (
      <div ref={root} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`Account: ${account.email}`}
          className="flex items-center gap-1.5 rounded-full py-1 pr-2 pl-1 hover:bg-[var(--color-hover)]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-accent)] text-[11px] font-medium text-white">
            {initial}
          </span>
          <SyncDot state={syncState} />
        </button>

        {open && (
          <div className="absolute right-0 z-50 mt-1.5 w-60 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-1 shadow-lg">
            <div className="px-2.5 py-2">
              <p className="truncate text-xs font-medium">{account.email}</p>
              <p className="mt-0.5 text-[11px] text-[var(--color-faint)]">
                {syncState === 'syncing'
                  ? 'Syncing…'
                  : syncState === 'error'
                    ? 'Saved here. Server unreachable.'
                    : 'Synced to your account'}
              </p>
            </div>
            <MenuItem
              icon={<RefreshCw size={13} />}
              label="Sync now"
              onClick={() => {
                onSyncNow()
                setOpen(false)
              }}
            />
            <MenuItem
              icon={<LogOut size={13} />}
              label="Sign out"
              onClick={async () => {
                await (await getSupabase())?.auth.signOut()
                onSignedOut()
                setOpen(false)
              }}
            />
            <p className="px-2.5 pt-1.5 pb-1 text-[10px] leading-snug text-[var(--color-faint)]">
              Signing out leaves every note on this device.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs font-medium hover:bg-[var(--color-hover)]"
      >
        Sign in
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-72 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-3 shadow-lg">
          <p className="text-xs font-medium">
            {mode === 'in' ? 'Sign in to sync' : 'Create an account'}
          </p>
          <p className="mt-0.5 mb-2.5 text-[11px] leading-snug text-[var(--color-faint)]">
            Optional. Your work is already saved on this device — an account
            adds it to your other ones.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
            className="space-y-2"
          >
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="Email"
              className="w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
            />
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              aria-label="Password"
              className="w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
            />

            {message && <p className="text-[11px] text-[var(--color-danger)]">{message}</p>}
            {notice && <p className="text-[11px] text-[var(--color-good)]">{notice}</p>}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-80"
            >
              {/* The label never changes while busy: a control that resizes
                  under a thumb is one that gets mis-tapped. */}
              {busy && <LoaderCircle size={12} className="animate-spin" />}
              {mode === 'in' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === 'in' ? 'up' : 'in'))
              setMessage(null)
              setNotice(null)
            }}
            className="mt-2 w-full text-center text-[11px] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
          >
            {mode === 'in' ? 'No account? Create one' : 'Already have an account? Sign in'}
          </button>
        </div>
      )}
    </div>
  )
}

function SyncDot({ state }: { state: SyncState }) {
  if (state === 'syncing') {
    return <LoaderCircle size={11} className="animate-spin text-[var(--color-faint)]" />
  }
  if (state === 'error') return <CloudOff size={11} className="text-[var(--color-faint)]" />
  return <Check size={11} className="text-[var(--color-good)]" />
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-[var(--color-hover)]"
    >
      <span className="text-[var(--color-muted)]">{icon}</span>
      {label}
    </button>
  )
}
