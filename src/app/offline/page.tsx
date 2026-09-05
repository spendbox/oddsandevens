export default function Offline() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-lg">
          🌐
        </div>
        <h1 className="text-lg font-semibold text-ink">You are offline</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Commons needs a connection to show what everyone is up to. This page will work again as
          soon as you are back.
        </p>
      </div>
    </main>
  )
}
