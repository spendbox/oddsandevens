import Link from 'next/link'
import { signOut } from '@/app/signin/actions'
import { optionalProfile } from '@/lib/session'
import { Wordmark } from './ui'

export async function SiteHeader() {
  const { profile } = await optionalProfile()

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3.5 sm:px-6">
        <Wordmark href={profile ? '/tools' : '/'} />

        <nav className="flex items-center gap-1.5">
          {profile ? (
            <>
              <Link href="/tools" className="btn btn-ghost">
                My tools
              </Link>
              <Link href="/new" className="btn btn-primary">
                New tool
              </Link>
              <form action={signOut}>
                <button type="submit" className="btn btn-ghost" title={`Signed in as ${profile.handle}`}>
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/signin" className="btn btn-ghost">
                Sign in
              </Link>
              <Link href="/signin?mode=signup" className="btn btn-primary">
                Start building
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
