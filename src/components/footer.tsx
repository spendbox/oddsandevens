import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Logo } from './site-header'
import { CONTACT_EMAIL } from '@/lib/contact'

/**
 * The footer, on every page.
 *
 * A product that takes money needs its terms, its privacy policy and a way to
 * reach a human reachable from anywhere in it — not only from the page somebody
 * happened to sign up on.
 */
export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/8">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <Logo size={26} />
              <span className="font-bold tracking-tight">Spendbox</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-mist">
              Create your box free. Share it. Earn.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-4 inline-flex items-center gap-2 text-sm text-mist underline underline-offset-4 transition hover:text-chalk"
            >
              <Mail size={15} /> {CONTACT_EMAIL}
            </a>
          </div>

          <nav className="grid gap-2 text-sm sm:text-right" aria-label="Footer">
            <Link href="/how-it-works" className="text-mist transition hover:text-chalk">
              How it works
            </Link>
            <Link href="/terms" className="text-mist transition hover:text-chalk">
              Terms and conditions
            </Link>
            <Link href="/privacy" className="text-mist transition hover:text-chalk">
              Privacy
            </Link>
            <Link href="/responsible-play" className="text-mist transition hover:text-chalk">
              Responsible play
            </Link>
          </nav>
        </div>

        <p className="mt-10 border-t border-white/6 pt-6 text-xs leading-relaxed text-dusk">
          Spendbox is a game of skill played for money. Coins are non-refundable once spent.
          Please only play with money you can afford to lose. © {new Date().getFullYear()}{' '}
          Spendbox.
        </p>
      </div>
    </footer>
  )
}
