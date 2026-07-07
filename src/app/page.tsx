import Link from "next/link";
import { Gift, Mail, Puzzle, ShieldCheck, Target, X } from "lucide-react";

// Decorative mini board for the hero: a fixed pattern, two "winning" tiles.
const DEMO_TILES: ("gift" | "miss" | "")[] = [
  "", "", "miss", "", "",
  "", "gift", "", "", "miss",
  "", "", "", "", "",
  "miss", "", "", "gift", "",
  "", "", "miss", "", "",
];

const FEATURES = [
  {
    Icon: Target,
    title: "One tap per visit",
    text: "Customers tap one tile per cooldown — hit a hidden reward or earn loyalty points either way.",
  },
  {
    Icon: Mail,
    title: "Codes, not coupons",
    text: "Winners get a unique redemption code by email, with a live expiry countdown built in.",
  },
  {
    Icon: ShieldCheck,
    title: "Fraud-proof redemption",
    text: "Staff redeem by code, never by looking up an email — no screenshots, no double-dipping.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div className="animate-fade-up flex flex-col items-center text-center">
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium tracking-wide text-emerald-700">
          Gamified loyalty for your business
        </span>

        <h1 className="mt-6 flex items-center gap-3 text-5xl font-bold tracking-tight text-zinc-900 sm:text-6xl">
          <Puzzle className="size-11 text-emerald-600 sm:size-13" aria-hidden />
          <span>
            Tile
            <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
              Hunt
            </span>
          </span>
        </h1>

        <p className="mt-5 max-w-lg text-balance text-lg leading-relaxed text-zinc-600">
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
          className="card mt-14 grid w-full max-w-[16rem] grid-cols-5 gap-1.5 p-3"
        >
          {DEMO_TILES.map((t, i) => (
            <div
              key={i}
              className={
                "flex aspect-square items-center justify-center rounded-lg " +
                (t === "gift"
                  ? "bg-emerald-100 text-emerald-600 shadow-[0_0_14px_rgb(16_185_129/0.3)] ring-1 ring-emerald-300"
                  : t === "miss"
                    ? "bg-zinc-100 text-zinc-300 ring-1 ring-zinc-200"
                    : "tile-live")
              }
            >
              {t === "gift" ? (
                <Gift className="size-4" />
              ) : t === "miss" ? (
                <X className="size-4" />
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-14 grid max-w-4xl gap-4 sm:grid-cols-3">
          {FEATURES.map(({ Icon, title, text }) => (
            <div key={title} className="card p-5 text-left">
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Icon className="size-5" aria-hidden />
              </div>
              <h2 className="mt-3 font-semibold text-zinc-900">{title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{text}</p>
            </div>
          ))}
        </div>

        <p className="mt-12 text-xs text-zinc-400">
          Free: 5×5 grid, 2 rewards &nbsp;·&nbsp; Premium: up to 20×20, 10 rewards
        </p>
      </div>
    </main>
  );
}
