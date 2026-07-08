import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Gift,
  Mail,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  X,
} from "lucide-react";

// Decorative hero board: a fixed pattern with a few "winning" tiles that pop
// on a loop. Purely CSS-animated so the landing stays a static server page.
const DEMO_TILES: ("gift" | "miss" | "")[] = [
  "", "", "miss", "", "", "gift",
  "", "gift", "", "", "miss", "",
  "miss", "", "", "gift", "", "",
  "", "", "miss", "", "", "miss",
  "", "gift", "", "miss", "", "",
  "miss", "", "", "", "gift", "",
];

const STEPS = [
  {
    Icon: Boxes,
    title: "Hide your rewards",
    text: "Drop your rewards onto a branded 7×7 grid. Positions are randomized server-side — even you can't see where they land.",
  },
  {
    Icon: Share2,
    title: "Share one link",
    text: "Put a single link in your WhatsApp bio, on receipts, or a counter QR. No app, no sign-up for customers.",
  },
  {
    Icon: Trophy,
    title: "Watch them come back",
    text: "One tap per visit: a win emails a redemption code, a miss earns loyalty points. Either way, they return.",
  },
];

const FEATURES = [
  {
    Icon: Target,
    title: "One tap per visit",
    text: "A built-in cooldown keeps the game fair and gives customers a reason to come back tomorrow.",
  },
  {
    Icon: Mail,
    title: "Codes, not coupons",
    text: "Winners get a unique redemption code by email with a live expiry countdown — no screenshots to fake.",
  },
  {
    Icon: ShieldCheck,
    title: "Fraud-proof redemption",
    text: "Staff redeem by code, never by looking up an email. A reward can't be over-claimed or double-dipped.",
  },
];

export default function LandingPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden px-6 py-16">
      {/* Drifting aurora background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute -left-32 -top-24 size-[36rem] rounded-full bg-emerald-300/25 blur-3xl"
          style={{ animation: "aurora-drift 18s ease-in-out infinite" }}
        />
        <div
          className="absolute -right-24 top-32 size-[32rem] rounded-full bg-teal-300/25 blur-3xl"
          style={{ animation: "aurora-drift 22s ease-in-out infinite reverse" }}
        />
        <div
          className="absolute bottom-0 left-1/3 size-[28rem] rounded-full bg-amber-200/20 blur-3xl"
          style={{ animation: "aurora-drift 26s ease-in-out infinite" }}
        />
      </div>

      {/* Hero */}
      <div className="flex w-full max-w-5xl flex-col items-center text-center">
        <span
          className="animate-fade-up inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/70 px-4 py-1.5 text-xs font-medium tracking-wide text-emerald-700 backdrop-blur"
          style={{ animationDelay: "0ms" }}
        >
          <Sparkles className="size-3.5" aria-hidden />
          Gamified loyalty for your business
        </span>

        <h1
          className="animate-fade-up mt-6 flex items-center gap-3 text-6xl font-extrabold tracking-tight text-zinc-900 sm:text-7xl"
          style={{ animationDelay: "80ms" }}
        >
          <span
            className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg sm:size-16"
            style={{ animation: "float-slow 5s ease-in-out infinite" }}
          >
            <Boxes className="size-8 sm:size-9" aria-hidden />
          </span>
          <span>
            Spend
            <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
              box
            </span>
          </span>
        </h1>

        <p
          className="animate-fade-up mt-5 max-w-xl text-balance text-lg leading-relaxed text-zinc-600"
          style={{ animationDelay: "160ms" }}
        >
          Turn one-time buyers into regulars. Hide rewards in a branded tile
          grid, share one link, and let your customers hunt for their next treat.
        </p>

        <div
          className="animate-fade-up mt-8 flex flex-wrap justify-center gap-3"
          style={{ animationDelay: "240ms" }}
        >
          <Link href="/signup" className="btn-primary text-base">
            Start free
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        {/* Animated hero board */}
        <div
          className="animate-fade-up card mt-14 grid w-full max-w-[20rem] grid-cols-6 gap-1.5 p-3"
          style={{ animationDelay: "320ms" }}
          aria-hidden
        >
          {DEMO_TILES.map((t, i) => (
            <div
              key={i}
              className={
                "flex aspect-square items-center justify-center rounded-lg " +
                (t === "gift"
                  ? "bg-emerald-100 text-emerald-600 ring-1 ring-emerald-300"
                  : t === "miss"
                    ? "bg-zinc-100 text-zinc-300 ring-1 ring-zinc-200"
                    : "tile-live")
              }
              style={
                t === ""
                  ? {
                      animation: `tile-shimmer ${2600 + ((i * 137) % 2000)}ms ease-in-out ${(i * 90) % 1800}ms infinite`,
                    }
                  : undefined
              }
            >
              {t === "gift" ? (
                <Gift
                  className="size-4"
                  style={{
                    animation: `gift-pop ${3400 + ((i * 211) % 1600)}ms ease-in-out ${(i * 130) % 1500}ms infinite`,
                  }}
                />
              ) : t === "miss" ? (
                <X className="size-4" />
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <section className="mt-24 w-full max-w-5xl">
        <h2 className="text-center text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
          How it works
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {STEPS.map(({ Icon, title, text }, i) => (
            <div
              key={title}
              className="animate-fade-up card relative overflow-hidden p-6 text-left"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <span className="absolute right-4 top-4 text-4xl font-bold text-zinc-100">
                {i + 1}
              </span>
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-sm">
                <Icon className="size-5" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold text-zinc-900">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mt-16 grid w-full max-w-5xl gap-4 sm:grid-cols-3">
        {FEATURES.map(({ Icon, title, text }, i) => (
          <div
            key={title}
            className="animate-fade-up card p-5 text-left"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Icon className="size-5" aria-hidden />
            </div>
            <h3 className="mt-3 font-semibold text-zinc-900">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{text}</p>
          </div>
        ))}
      </section>

      {/* Pricing strip */}
      <section className="mt-16 w-full max-w-3xl">
        <div className="card grid gap-4 p-6 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-100 p-5">
            <p className="text-sm font-semibold text-zinc-900">Free</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
              100 <span className="text-base font-medium text-zinc-500">taps/yr</span>
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              One live grid, two rewards, and your own branded board. Perfect for
              getting started.
            </p>
          </div>
          <div className="relative rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
            <span className="absolute right-4 top-4 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              Premium
            </span>
            <p className="text-sm font-semibold text-emerald-800">Premium</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
              5,000 <span className="text-base font-medium text-zinc-500">taps/yr</span>
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              Up to 10 grids, 10 rewards each, custom puzzle images, and
              interlocking tiles. Top up any time — on any plan.
            </p>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-zinc-400">
          A tap is one tile a customer flips. Need more? Buy top-up taps in a
          click — no upgrade required.
        </p>
      </section>

      <div className="mt-16 flex flex-col items-center">
        <Link href="/signup" className="btn-primary text-base">
          Create your first board
          <ArrowRight className="size-4" aria-hidden />
        </Link>
        <p className="mt-6 text-xs text-zinc-400">
          Spendbox · spendbox.site · already playing?{" "}
          <Link href="/me" className="underline transition hover:text-zinc-600">
            See your rewards
          </Link>
        </p>
      </div>
    </main>
  );
}
