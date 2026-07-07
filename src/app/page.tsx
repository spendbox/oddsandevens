import Link from "next/link";

// Decorative mini board for the hero: a fixed pattern, two "winning" tiles.
const DEMO_TILES = [
  "", "", "✕", "", "",
  "", "🎁", "", "", "✕",
  "", "", "", "", "",
  "✕", "", "", "🎁", "",
  "", "", "✕", "", "",
];

const FEATURES = [
  {
    icon: "🎯",
    title: "One tap per visit",
    text: "Customers tap one tile per cooldown — hit a hidden reward or earn loyalty points either way.",
  },
  {
    icon: "📧",
    title: "Codes, not coupons",
    text: "Winners get a unique redemption code by email, with a live expiry countdown built in.",
  },
  {
    icon: "🔒",
    title: "Fraud-proof redemption",
    text: "Staff redeem by code, never by looking up an email — no screenshots, no double-dipping.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div className="animate-fade-up flex flex-col items-center text-center">
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium tracking-wide text-emerald-300">
          Gamified loyalty for your business
        </span>

        <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl">
          🧩 Tile<span className="bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-transparent">Hunt</span>
        </h1>

        <p className="mt-5 max-w-lg text-balance text-lg leading-relaxed text-zinc-400">
          Turn one-time buyers into regulars. Hide rewards in a branded tile
          grid, share one link on WhatsApp, and let your customers hunt.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="btn-primary">
            Start free — 5×5 grid
          </Link>
          <Link href="/login" className="btn-secondary">
            Merchant login
          </Link>
        </div>

        <div
          aria-hidden
          className="mt-14 grid w-full max-w-[16rem] grid-cols-5 gap-1.5 rounded-2xl border border-white/10 bg-zinc-900/50 p-3 shadow-[0_20px_60px_rgb(16_185_129/0.12)]"
        >
          {DEMO_TILES.map((t, i) => (
            <div
              key={i}
              className={
                "flex aspect-square items-center justify-center rounded-lg text-sm " +
                (t === "🎁"
                  ? "bg-emerald-500/25 shadow-[0_0_14px_rgb(16_185_129/0.45)] ring-1 ring-emerald-400/50"
                  : t === "✕"
                    ? "bg-zinc-900 text-zinc-700 ring-1 ring-white/5"
                    : "bg-gradient-to-br from-emerald-600/80 to-teal-700/80 ring-1 ring-white/10")
              }
            >
              {t}
            </div>
          ))}
        </div>

        <div className="mt-14 grid max-w-4xl gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5 text-left">
              <div className="text-2xl">{f.icon}</div>
              <h2 className="mt-3 font-semibold text-white">{f.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{f.text}</p>
            </div>
          ))}
        </div>

        <p className="mt-12 text-xs text-zinc-600">
          Free: 5×5 grid, 1 reward &nbsp;·&nbsp; Premium: up to 20×20, 10 rewards
        </p>
      </div>
    </main>
  );
}
