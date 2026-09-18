'use client'

import { Eye, EyeOff, LoaderCircle, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { openTeamNext } from '@/lib/mode'
import { getSupabase, isSyncConfigured } from '@/lib/supabase'

/**
 * Signing in, for somebody who arrived on a team's link.
 *
 * One screen, one job, nothing else on it. Whoever follows this link has
 * been sent it by a person, not by this app, and the only useful thing to
 * put in front of them is the name of the team and a way in.
 *
 * ## It does not join anybody to anything
 *
 * Membership comes from an admin adding an email address. So signing in
 * here does exactly what signing in anywhere does — and if that address
 * was added, the team is already waiting; if it was not, the page says so
 * plainly rather than pretending something went wrong.
 */
export default function TeamDoor({ teamId, name }: { teamId: string; name: string | null }) {
  const router = useRouter()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showing, setShowing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  /**
   * Opens the app in Team mode, on this team, since that is what they came
   * here for. If they were never added, it opens on whichever team they
   * are in, or on the sentence saying they are in none.
   */
  const go = () => {
    try {
      localStorage.setItem('pad-mode', 'team')
    } catch {
      // The app opens on the notes instead, and the switch is at the top.
    }
    openTeamNext(teamId)
    router.push('/')
  }

  const submit = async () => {
    setBusy(true)
    setMessage(null)
    setNotice(null)
    try {
      const db = await getSupabase()
      if (!db) {
        setMessage('Sign-in is not set up on this copy of Pad.')
        return
      }
      if (mode === 'up') {
        const { data, error } = await db.auth.signUp({ email, password })
        if (error) setMessage(error.message)
        else if (data.session) go()
        else setNotice('Check your email to confirm the address, then sign in here.')
      } else {
        const { data, error } = await db.auth.signInWithPassword({ email, password })
        if (error) setMessage(error.message)
        else if (data.user) go()
      }
    } catch {
      setMessage('Could not reach the server. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-paper)] px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="flex items-center gap-2 text-[13px] text-[var(--color-faint)]">
          <Users size={15} />
          A team on Pad
        </p>
        <h1 className="pad-serif mt-1 text-[30px] leading-tight font-semibold tracking-tight">
          {name ?? 'This team'}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-muted)]">
          Sign in to see the chat and what the team has to do. If you do not have an account yet,
          make one with the address you were added with.
        </p>

        {!isSyncConfigured() ? (
          <p className="mt-5 rounded-xl bg-[var(--color-hover)] p-3 text-[13px] text-[var(--color-muted)]">
            Accounts are not set up on this copy of Pad, so there is nothing to sign in to.
          </p>
        ) : (
          <form
            className="mt-5 space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              aria-label="Email"
              className="w-full rounded-lg border border-[var(--color-line)] bg-transparent px-3 py-2.5 text-[15px] outline-none focus:border-[var(--color-accent)]"
            />
            <span className="relative block">
              <input
                type={showing ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                aria-label="Password"
                className="w-full rounded-lg border border-[var(--color-line)] bg-transparent py-2.5 pr-10 pl-3 text-[15px] outline-none focus:border-[var(--color-accent)]"
              />
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setShowing((on) => !on)}
                aria-label={showing ? 'Hide the password' : 'Show the password'}
                aria-pressed={showing}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--color-faint)] hover:text-[var(--color-ink)]"
              >
                {showing ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] py-2.5 text-[15px] font-medium text-white disabled:opacity-50"
            >
              {busy && <LoaderCircle size={15} className="animate-spin" />}
              {mode === 'in' ? 'Sign in' : 'Create an account'}
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
              className="w-full py-1 text-[13px] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              {mode === 'in' ? 'I do not have an account yet' : 'I already have an account'}
            </button>
          </form>
        )}

        {message && <p className="mt-2 text-[13px] text-[var(--color-danger)]">{message}</p>}
        {notice && <p className="mt-2 text-[13px] text-[var(--color-muted)]">{notice}</p>}

        <p className="mt-6 text-[12px] leading-relaxed text-[var(--color-faint)]">
          This link is a way in to Pad, not a way into the team: an admin still has to have added
          your email address. Pad is also a place to write your own notes, which nobody else ever
          sees.
        </p>
      </div>
    </div>
  )
}
