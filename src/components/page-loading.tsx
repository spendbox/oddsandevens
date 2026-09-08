import { Mascot } from './mascot'

/**
 * What a page shows while it is being fetched.
 *
 * Used by the loading.tsx files, which Next renders the instant a navigation
 * starts — before the server has answered. Without one, tapping a link on a
 * slow connection does nothing visible for a second, and people tap again.
 *
 * Boxy plus a couple of grey blocks rather than a bare spinner: it says the
 * app is working and roughly what shape is coming, and it is the same character
 * that is everywhere else rather than a generic loader.
 */
export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16" role="status" aria-live="polite">
      <div className="flex flex-col items-center">
        <Mascot mood="thinking" size={104} />
        <p className="mt-4 text-sm text-mist">{label}</p>
      </div>

      <div className="mt-10 grid gap-3" aria-hidden>
        <div className="animate-pulse-glow h-28 rounded-3xl bg-white/6" />
        <div className="animate-pulse-glow h-20 rounded-3xl bg-white/5 [animation-delay:150ms]" />
        <div className="animate-pulse-glow h-20 rounded-3xl bg-white/4 [animation-delay:300ms]" />
      </div>
    </main>
  )
}
