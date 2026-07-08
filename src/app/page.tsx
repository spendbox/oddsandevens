"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  ChevronDown,
  Gift,
  Link2,
  Mail,
  MessageCircle,
  QrCode,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  X,
} from "lucide-react";

// The landing is a vertical deck of full-screen snap cards: each swipe up
// snaps to the next section, and the section flips into view like a card
// being turned (see FlipCard). Everything is CSS-animated; the only JS is
// two IntersectionObservers (flip trigger + active-dot tracking).

// Decorative hero board: a fixed pattern with a few "winning" tiles that pop
// on a loop.
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

const SECTIONS = [
  { id: "hero", label: "Spendbox" },
  { id: "step-1", label: "Hide your rewards" },
  { id: "step-2", label: "Share one link" },
  { id: "step-3", label: "Watch them come back" },
  { id: "features", label: "Why it works" },
  { id: "pricing", label: "Pricing" },
  { id: "start", label: "Get started" },
];

// Flips its content in (rotateX from below, like turning a card up) whenever
// it scrolls into view, and back out when it leaves — so scrolling the deck
// in either direction always feels like flipping through cards.
function FlipCard({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setShown(entry.isIntersecting),
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={"w-full [perspective:1400px] " + className}>
      <div
        className={
          "origin-bottom transition-all duration-700 will-change-transform [transform-style:preserve-3d] motion-reduce:transition-none motion-reduce:transform-none! motion-reduce:opacity-100! " +
          (shown
            ? "opacity-100 [transform:rotateX(0deg)_translateY(0)_scale(1)]"
            : "opacity-0 [transform:rotateX(32deg)_translateY(90px)_scale(0.93)]")
        }
        style={{
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          transitionDelay: shown ? `${delay}ms` : "0ms",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// One full-screen snap card in the deck.
function Deck({
  id,
  children,
  className = "",
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={
        "relative flex min-h-svh snap-start flex-col items-center justify-center px-6 py-14 " +
        className
      }
    >
      {children}
    </section>
  );
}

// --- Per-step animated visuals -------------------------------------------

// Step 1: a mini grid shimmering while gift tiles pop — rewards being hidden.
function HideRewardsVisual() {
  const gifts = new Set([3, 7, 16, 21]);
  return (
    <div className="mx-auto grid w-44 grid-cols-5 gap-1" aria-hidden>
      {Array.from({ length: 25 }, (_, i) => (
        <div
          key={i}
          className="tile-live flex aspect-square items-center justify-center rounded-md"
          style={{
            animation: `tile-shimmer ${2400 + ((i * 131) % 1800)}ms ease-in-out ${(i * 97) % 1600}ms infinite`,
          }}
        >
          {gifts.has(i) && (
            <Gift
              className="size-3.5 text-white"
              style={{
                animation: `gift-pop ${3000 + ((i * 173) % 1400)}ms ease-in-out ${(i * 210) % 1200}ms infinite`,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Step 2: the one link with a sheen sweeping across it, channels floating around.
function ShareLinkVisual() {
  const orbit = [
    { Icon: MessageCircle, className: "-left-2 top-2", delay: "0ms" },
    { Icon: QrCode, className: "-right-3 top-10", delay: "600ms" },
    { Icon: Mail, className: "left-4 bottom-0", delay: "1200ms" },
  ];
  return (
    <div className="relative mx-auto flex h-40 w-full max-w-xs items-center justify-center" aria-hidden>
      {orbit.map(({ Icon, className, delay }) => (
        <span
          key={delay}
          className={`absolute flex size-9 items-center justify-center rounded-xl border border-emerald-100 bg-white text-emerald-600 shadow-md ${className}`}
          style={{ animation: `float-slow 4.5s ease-in-out ${delay} infinite` }}
        >
          <Icon className="size-4" />
        </span>
      ))}
      <div className="relative overflow-hidden rounded-full border border-emerald-200 bg-white px-5 py-2.5 font-mono text-sm text-emerald-700 shadow-lg">
        <span className="flex items-center gap-2">
          <Link2 className="size-4" />
          spendbox.site/g/your-shop
        </span>
        <span
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(105deg, transparent 40%, rgb(255 255 255 / 0.95) 50%, transparent 60%)",
            backgroundSize: "250% 100%",
            animation: "sheen 2.8s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}

// Step 3: the trophy pulsing with halo rings, loyalty points drifting in.
function ComeBackVisual() {
  const chips = [
    { label: "+1 point", className: "-left-4 top-4", delay: "300ms" },
    { label: "+1 point", className: "-right-6 top-14", delay: "1400ms" },
    { label: "10% off", className: "left-0 bottom-0", delay: "2300ms" },
  ];
  return (
    <div className="relative mx-auto flex h-40 w-full max-w-xs items-center justify-center" aria-hidden>
      <span
        className="absolute size-24 rounded-full bg-emerald-400/30"
        style={{ animation: "ring-pulse 2.4s ease-out infinite" }}
      />
      <span
        className="absolute size-24 rounded-full bg-emerald-400/30"
        style={{ animation: "ring-pulse 2.4s ease-out 1.2s infinite" }}
      />
      <div
        className="relative flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-xl"
        style={{ animation: "float-slow 4s ease-in-out infinite" }}
      >
        <Trophy className="size-10" />
      </div>
      {chips.map(({ label, className, delay }) => (
        <span
          key={className}
          className={`absolute flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-600 shadow-md ${className}`}
          style={{ animation: `float-slow 5s ease-in-out ${delay} infinite` }}
        >
          <Star className="size-3 fill-amber-400 text-amber-400" />
          {label}
        </span>
      ))}
    </div>
  );
}

const STEP_VISUALS = [HideRewardsVisual, ShareLinkVisual, ComeBackVisual];

// A "How it works" card: step chip, animated visual, icon, copy, deck dots.
function StepCard({ index }: { index: number }) {
  const { Icon, title, text } = STEPS[index];
  const Visual = STEP_VISUALS[index];
  return (
    <div className="card relative w-full max-w-lg overflow-hidden p-8 text-center sm:p-10">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-2 -top-10 select-none text-[10rem] font-black leading-none text-emerald-500/[0.07]"
      >
        {index + 1}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
        How it works · {index + 1} of 3
      </span>
      <div className="mt-6 flex h-40 items-center justify-center">
        <Visual />
      </div>
      <div className="mx-auto mt-6 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md">
        <Icon className="size-6" aria-hidden />
      </div>
      <h3 className="mt-4 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
        {title}
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-zinc-600 sm:text-base">
        {text}
      </p>
      <div className="mt-7 flex justify-center gap-1.5" aria-hidden>
        {STEPS.map((_, n) => (
          <span
            key={n}
            className={
              "h-1.5 rounded-full transition-all " +
              (n === index ? "w-6 bg-emerald-500" : "w-1.5 bg-zinc-200")
            }
          />
        ))}
      </div>
    </div>
  );
}

function SwipeHint() {
  return (
    <div
      className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-0.5 text-zinc-400"
      aria-hidden
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.2em]">
        Swipe
      </span>
      <ChevronDown
        className="size-5"
        style={{ animation: "swipe-hint 1.6s ease-in-out infinite" }}
      />
    </div>
  );
}

export default function LandingPage() {
  const mainRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState("hero");

  // Track which card is on screen so the side dots follow the deck.
  useEffect(() => {
    const root = mainRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { root, threshold: 0.5 }
    );
    root.querySelectorAll("section[id]").forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <main
      ref={mainRef}
      className="h-svh snap-y snap-mandatory overflow-y-auto scroll-smooth"
    >
      {/* Drifting aurora background, fixed behind the whole deck */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
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

      {/* Deck progress dots */}
      <nav
        aria-label="Page sections"
        className="fixed right-3.5 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-2.5 sm:right-6"
      >
        {SECTIONS.map(({ id, label }) => (
          <button
            key={id}
            aria-label={label}
            aria-current={active === id ? "true" : undefined}
            onClick={() =>
              document
                .getElementById(id)
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className={
              "size-2.5 cursor-pointer rounded-full transition-all duration-300 " +
              (active === id
                ? "scale-125 bg-emerald-600 shadow-[0_0_8px_rgb(5_150_105/0.5)]"
                : "bg-zinc-300 hover:bg-zinc-400")
            }
          />
        ))}
      </nav>

      {/* Card 1 — Hero */}
      <Deck id="hero">
        <div className="flex w-full max-w-5xl flex-col items-center text-center">
          <span
            className="animate-fade-up inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white/70 px-4 py-1.5 text-xs font-medium tracking-wide text-emerald-700 backdrop-blur"
            style={{ animationDelay: "0ms" }}
          >
            <Sparkles className="size-3.5" aria-hidden />
            Gamified loyalty for your business
          </span>

          <h1
            className="animate-fade-up mt-6 flex items-center gap-3 text-5xl font-extrabold tracking-tight text-zinc-900 sm:text-7xl"
            style={{ animationDelay: "80ms" }}
          >
            <span
              className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg sm:size-16"
              style={{ animation: "float-slow 5s ease-in-out infinite" }}
            >
              <Boxes className="size-7 sm:size-9" aria-hidden />
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
            Turn one-time shoppers into repeat buyers. Hide rewards inside a
            beautifully branded grid, share one link, and let your customers
            play to win their next perk.
          </p>

          <div
            className="animate-fade-up mt-7 flex flex-wrap justify-center gap-3"
            style={{ animationDelay: "240ms" }}
          >
            <Link href="/signup" className="btn-primary text-base">
              Start free
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>

          {/* Animated hero board */}
          <div
            className="animate-fade-up card mt-10 grid w-full max-w-[17rem] grid-cols-6 gap-1.5 p-3"
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
        <SwipeHint />
      </Deck>

      {/* Cards 2–4 — How it works, one card per step */}
      {STEPS.map((_, i) => (
        <Deck key={i} id={`step-${i + 1}`}>
          <FlipCard className="flex justify-center">
            <StepCard index={i} />
          </FlipCard>
          <SwipeHint />
        </Deck>
      ))}

      {/* Card 5 — Features */}
      <Deck id="features">
        <div className="w-full max-w-5xl">
          <FlipCard>
            <h2 className="text-center text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Why it works
            </h2>
            <p className="mt-2 text-center text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              Built to bring them back
            </p>
          </FlipCard>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {FEATURES.map(({ Icon, title, text }, i) => (
              <FlipCard key={title} delay={i * 130}>
                <div className="card h-full p-5 text-left sm:p-6">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <h3 className="mt-3 font-semibold text-zinc-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
                    {text}
                  </p>
                </div>
              </FlipCard>
            ))}
          </div>
        </div>
        <SwipeHint />
      </Deck>

      {/* Card 6 — Pricing */}
      <Deck id="pricing">
        <div className="w-full max-w-3xl">
          <FlipCard>
            <h2 className="text-center text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Pricing
            </h2>
            <p className="mt-2 text-center text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              Start free, top up any time
            </p>
          </FlipCard>
          <FlipCard delay={120}>
            <div className="card mt-8 grid gap-4 p-6 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-100 p-5">
                <p className="text-sm font-semibold text-zinc-900">Free</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
                  100{" "}
                  <span className="text-base font-medium text-zinc-500">
                    taps/yr
                  </span>
                </p>
                <p className="mt-2 text-sm text-zinc-600">
                  One live grid, two rewards, and your own branded board.
                  Perfect for getting started.
                </p>
              </div>
              <div className="relative rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
                <span className="absolute right-4 top-4 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                  Premium
                </span>
                <p className="text-sm font-semibold text-emerald-800">
                  Premium
                </p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
                  5,000{" "}
                  <span className="text-base font-medium text-zinc-500">
                    taps/yr
                  </span>
                </p>
                <p className="mt-2 text-sm text-zinc-600">
                  Up to 10 grids, 10 rewards each, custom puzzle images, and
                  interlocking tiles. Top up any time — on any plan.
                </p>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-zinc-400">
              A tap is one tile a customer flips. Need more? Buy top-up taps in
              a click — no upgrade required.
            </p>
          </FlipCard>
        </div>
        <SwipeHint />
      </Deck>

      {/* Card 7 — Final CTA */}
      <Deck id="start">
        <FlipCard className="flex justify-center">
          <div className="flex flex-col items-center text-center">
            <div
              className="flex size-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-xl"
              style={{ animation: "float-slow 5s ease-in-out infinite" }}
            >
              <Boxes className="size-8" aria-hidden />
            </div>
            <h2 className="mt-6 max-w-xl text-balance text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl">
              Ready to turn taps into repeat customers?
            </h2>
            <p className="mt-4 max-w-md text-balance text-zinc-600">
              Your first board takes about two minutes to set up — rewards,
              brand colors, link and all.
            </p>
            <Link href="/signup" className="btn-primary mt-8 text-base">
              Create your first board
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <p className="mt-8 text-xs text-zinc-400">
              Spendbox · spendbox.site · already playing?{" "}
              <Link
                href="/me"
                className="underline transition hover:text-zinc-600"
              >
                See your rewards
              </Link>
            </p>
          </div>
        </FlipCard>
      </Deck>
    </main>
  );
}
