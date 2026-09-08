import { KeyRound, Check, X } from 'lucide-react'
import { ButtonLink, Card } from '@/components/ui'
import { readSupabaseEnv } from '@/lib/supabase/env'
import { adminConfigured } from '@/lib/supabase/admin'
import { paymentsConfigured } from '@/lib/paystack'
import { isAdmin, optionalProfile } from '@/lib/session'

export const metadata = { title: 'Setup' }

// Read on every request on purpose: the entire question this page answers is
// "what can the deployment see right now", and a cached answer would be a
// different deployment's.
export const dynamic = 'force-dynamic'

/**
 * What this deployment can see.
 *
 * It exists because the alternative was a stack trace on every URL. When
 * Supabase is not configured there is no sign-in, so there is no admin page to
 * put this behind — it has to be reachable by the person holding the phone.
 *
 * It reports whether each setting has a value and nothing else. No values, no
 * keys, no fragments of keys. "Set" and "not set" is all anybody needs to tell
 * these two situations apart, and it is not worth leaking a service-role key to
 * say more.
 *
 * The list itself is open exactly when it has to be. With Supabase down nobody
 * can sign in, so it shows to anyone — there is no door left to knock on. Once
 * Supabase is working there is an admin sign-in again, so the detail goes back
 * behind it and a stranger is told only that the site is set up, which they
 * could infer from the site working.
 */
function Row({ name, set, note }: { name: string; set: boolean; note: string }) {
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <span
        className={
          'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ' +
          (set ? 'bg-lime/15 text-lime' : 'bg-rose/15 text-rose')
        }
        aria-hidden
      >
        {set ? <Check size={14} /> : <X size={14} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm break-all">{name}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-dusk">{note}</p>
      </div>
      <span
        className={
          'shrink-0 text-xs font-semibold ' + (set ? 'text-lime' : 'text-rose')
        }
      >
        {set ? 'set' : 'not set'}
      </span>
    </li>
  )
}

export default async function SetupPage() {
  const supabase = readSupabaseEnv()

  // Only ask who is looking once there is something to ask with.
  const profile = supabase.ok ? await optionalProfile() : null
  const detailed = !supabase.ok || (profile !== null && isAdmin(profile.email))

  const rows = [
    {
      name: 'NEXT_PUBLIC_SUPABASE_URL',
      set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
      note: 'Your Supabase project URL. The browser needs this one, so it has to have the prefix.',
    },
    {
      name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
      note: 'The "anon"/"publishable" key. Safe in a browser — row level security is what protects the data.',
    },
    {
      name: 'SUPABASE_URL',
      set: Boolean(process.env.SUPABASE_URL?.trim()),
      note: 'Optional twin of the first, without the prefix. Read fresh on every request, so it works without a redeploy.',
    },
    {
      name: 'SUPABASE_ANON_KEY',
      set: Boolean(process.env.SUPABASE_ANON_KEY?.trim()),
      note: 'Optional twin of the second. Same reason.',
    },
    {
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      set: adminConfigured(),
      note: 'The secret key. Every coin, pattern, answer and winner goes through it. Never give it a NEXT_PUBLIC_ prefix.',
    },
    {
      name: 'PAYSTACK_SECRET_KEY',
      set: paymentsConfigured(),
      note: 'Buying coins. Without it the wallet says payments are switched off, and everything else still works.',
    },
    {
      name: 'RESEND_API_KEY',
      set: Boolean(process.env.RESEND_API_KEY?.trim()),
      note: 'Password reset emails. Without it nobody can reset a password.',
    },
    {
      name: 'ADMIN_EMAILS',
      set: Boolean(process.env.ADMIN_EMAILS?.trim()),
      note: 'Who can open /admin. Empty means nobody, including you.',
    },
  ]

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 pb-24">
      <KeyRound size={44} className="text-gold" />
      <h1 className="mt-4 text-3xl font-bold tracking-tight">
        {supabase.ok ? 'This deployment is set up' : 'This deployment cannot reach Supabase'}
      </h1>

      <p className="mt-3 leading-relaxed text-mist">
        {supabase.ok
          ? 'Spendbox can see everything it needs to run.'
          : supabase.problem}
      </p>

      {supabase.ok && !detailed ? (
        <>
          <p className="mt-3 text-sm text-mist">
            The rest of this page — which of the optional settings are in place — is for whoever
            runs the site. Sign in as an admin to see it.
          </p>
          <ButtonLink href="/home" tone="gold" size="lg" className="mt-6">
            Go to Spendbox
          </ButtonLink>
        </>
      ) : null}

      {!supabase.ok ? (
        <Card className="mt-8 border-gold/30 bg-gold/8">
          <p className="text-sm font-semibold">Why this can happen with the variable already set</p>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            A name beginning <code className="font-mono text-cyan">NEXT_PUBLIC_</code> is compiled
            into the build, not looked up when somebody visits. So a deployment built before you
            added the variable cannot see it, however long it has been sitting in the dashboard —
            and neither can one built by a job that had a different set of variables, which is what
            a Production value does to a Preview deployment.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-mist">
            Two fixes, and doing both is worth it. Redeploy, so the current build is made with the
            variables in place. And add{' '}
            <code className="font-mono text-cyan">SUPABASE_URL</code> and{' '}
            <code className="font-mono text-cyan">SUPABASE_ANON_KEY</code> — the same two values,
            without the prefix. Those are never compiled in, so they are read on every request and
            take effect as soon as they are saved.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-mist">
            In Vercel, tick every environment you actually deploy: Production, Preview and
            Development.
          </p>
        </Card>
      ) : null}

      {detailed ? (
        <>
          <Card className="mt-6 overflow-hidden !p-0">
            <ul className="divide-y divide-white/6">
              {rows.map((row) => (
                <Row key={row.name} {...row} />
              ))}
            </ul>
          </Card>

          <p className="mt-6 text-sm text-dusk">
            Running locally? The same names go in{' '}
            <code className="font-mono">.env.local</code>, and{' '}
            <code className="font-mono">next dev</code> has to be restarted to pick them up.
          </p>
        </>
      ) : null}
    </main>
  )
}
