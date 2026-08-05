import Link from "next/link";
import { currentPlayerState } from "@/lib/player-state";
import { ArrowRight } from "lucide-react";
import { PlayerProvider } from "@/components/player/player-context";
import { SiteHeader } from "@/components/site-header";
import { Boxy } from "@/components/art/boxy";
import { SiteFooter } from "@/components/site-footer";
import { FaqBrowser } from "./faq-browser";

export const metadata = {
  title: "Questions — Spendbox",
  description:
    "How Spendbox works: guessing, lives, power-ups, invites, putting up a box of your own, and where the money goes.",
};

export default async function FaqPage() {
  return (
    <PlayerProvider initial={await currentPlayerState()}>
      <SiteHeader />
      <main className="flex-1">
        <div className="relative mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 -z-10 size-[30rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brass/10 blur-3xl"
          />

          <header className="animate-fade-up mb-8 text-center">
            <Boxy mood="sly" className="mx-auto size-28" />
            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
              Questions
            </h1>
            <p className="mx-auto mt-2 max-w-lg text-zinc-400">
              The game screens stay out of your way on purpose. Everything they
              don’t explain is here.
            </p>
          </header>

          <FaqBrowser />

          <div className="panel mt-10 flex flex-col items-center gap-4 rounded-3xl p-6 text-center sm:flex-row sm:text-left">
            <Boxy mood="happy" className="size-20 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-zinc-100">Still stuck?</p>
              <p className="mt-0.5 text-sm text-zinc-500">
                Every box has the rules a tap away, and your own page shows
                exactly where your lives and rewards have got to.
              </p>
            </div>
            <Link
              href="/"
              style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
              className="btn-chunky inline-flex shrink-0 items-center gap-2 rounded-2xl bg-brass px-5 py-3 text-ink"
            >
              Find a safe
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </PlayerProvider>
  );
}
