export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* A shared link is often opened cold on a slow connection, so unlike the
          editor — which paints instantly from local data — this one genuinely
          waits on a request and should say so. */}
      <div className="h-8 w-2/3 animate-pulse rounded bg-[var(--color-hover)]" />
      <div className="mt-4 h-4 w-full animate-pulse rounded bg-[var(--color-hover)]" />
      <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-[var(--color-hover)]" />
    </div>
  )
}
