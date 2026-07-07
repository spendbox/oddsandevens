import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-center text-white">
      <h1 className="text-4xl font-bold sm:text-5xl">🧩 TileHunt</h1>
      <p className="mt-4 max-w-md text-zinc-400">
        Turn one-time buyers into regulars. Hide rewards in a branded tile
        grid, share one link on WhatsApp, and let your customers hunt.
      </p>
      <ul className="mt-6 max-w-md space-y-2 text-sm text-zinc-300">
        <li>🎯 Customers tap one tile per cooldown — hit a reward or earn loyalty points</li>
        <li>📧 Winners get a unique redemption code by email, with an expiry countdown</li>
        <li>🔒 Staff redeem by code, never by looking up an email</li>
      </ul>
      <div className="mt-8 flex gap-3">
        <Link
          href="/signup"
          className="rounded-lg bg-emerald-500 px-5 py-2.5 font-semibold text-emerald-950 hover:bg-emerald-400"
        >
          Start free (5×5 grid)
        </Link>
        <Link
          href="/login"
          className="rounded-lg bg-zinc-800 px-5 py-2.5 font-semibold hover:bg-zinc-700"
        >
          Merchant login
        </Link>
      </div>
      <p className="mt-6 text-xs text-zinc-600">
        Free: 5×5 grid, 1 reward · Premium: up to 20×20, 10 rewards
      </p>
    </main>
  );
}
