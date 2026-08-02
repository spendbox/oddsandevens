"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Gamepad2,
  Gem,
  Hammer,
  Link2,
  Mail,
  MessageCircle,
  QrCode,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Sword,
  Trophy,
  Wand2,
} from "lucide-react";
import { GameLoop } from "@/components/games/game-loop";

// The landing is a vertical deck of full-screen snap cards: each swipe up
// snaps to the next section, and the section flips into view like a card
// being turned (see FlipCard). Everything is CSS-animated; the only JS is
// two IntersectionObservers (flip trigger + active-dot tracking).

// The hero sample. This is the whole catalogue, not a selection from it, so
// the labels have to stay in step with the games marked `competitive` in
// `GAMES` — anything hidden there has to come out of here too.
const DEMO_GAMES: {
  label: string;
  type: string;
  icon: string;
  swatch: [string, string];
}[] = [
  {
    label: "Whack-a-Mole",
    type: "whack-a-mole",
    icon: "hammer",
    swatch: ["#a16207", "#16a34a"],
  },
  {
    label: "Slice Ninja",
    type: "slice-ninja",
    icon: "sword",
    swatch: ["#e11d48", "#f59e0b"],
  },
  {
    label: "Match Three",
    type: "match-3",
    icon: "gem",
    swatch: ["#db2777", "#7c3aed"],
  },
];

const STEPS = [
  {
    Icon: Gamepad2,
    title: "Pick a game",
    text: "Whack-a-mole, slice ninja, match three. Pick one and it's already written for your business — your products on it, your prizes in it.",
  },
  {
    Icon: Wand2,
    title: "Make it yours",
    text: "Your logo, your colours, and the prizes for the top of the board. The real game plays right beside you as you set it up, so nothing has to be imagined.",
  },
  {
    Icon: Share2,
    title: "Share one link",
    text: "Drop it in your WhatsApp bio, on receipts, or a counter QR. No app and no sign-up — when the week ends, the winners get a redemption code by email.",
  },
];

const FEATURES = [
  {
    Icon: Trophy,
    title: "A weekly leaderboard",
    text: "Every game is a competition that runs for a week. Top scores win the prizes you set, the board resets, and the chase starts again.",
  },
  {
    Icon: Mail,
    title: "Codes, not coupons",
    text: "Winners get a unique redemption code by email with a live expiry countdown — no screenshots to fake.",
  },
  {
    Icon: ShieldCheck,
    title: "Scores you can trust",
    text: "Every score is checked and recorded on our servers, and each player gets a fixed number of plays a week — so the board rewards skill, not a faster phone.",
  },
];

// An illustration of a finished week, not anyone's real board. Names are
// masked on the live leaderboards the same way.
const WEEK_BOARD = [
  { medal: "🥇", name: "ad***a@gmail.com", score: "4,820" },
  { medal: "🥈", name: "ch***u@gmail.com", score: "4,415" },
  { medal: "🥉", name: "to***e@yahoo.com", score: "3,970" },
  { medal: "4", name: "you", score: "3,201" },
];

const SECTIONS = [
  { id: "hero", label: "Spendbox" },
  { id: "story", label: "A week on Spendbox" },
  { id: "step-1", label: "Pick a game" },
  { id: "step-2", label: "Make it yours" },
  { id: "step-3", label: "Share one link" },
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

// Step 1: the catalogue — the three games drifting into view.
function PickAGameVisual() {
  const picks = [
    { Icon: Hammer, className: "left-1 top-3", delay: "0ms" },
    { Icon: Sword, className: "right-1 top-1", delay: "600ms" },
    { Icon: Gem, className: "left-1/2 bottom-2 -translate-x-1/2", delay: "1200ms" },
  ];
  return (
    <div className="relative mx-auto h-40 w-full max-w-xs" aria-hidden>
      {picks.map(({ Icon, className, delay }) => (
        <span
          key={delay}
          className={`absolute flex size-12 items-center justify-center rounded-2xl border border-emerald-100 bg-white text-emerald-600 shadow-lg ${className}`}
          style={{ animation: `float-slow 5s ease-in-out ${delay} infinite` }}
        >
          <Icon className="size-6" />
        </span>
      ))}
    </div>
  );
}

// Step 3: the one link with a sheen sweeping across it, channels floating around.
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
          spendbox.site/p/your-shop
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

// Step 2: the game being dressed — it playing inside a phone, with the
// settings that shaped it floating alongside.
function MakeItYoursVisual() {
  const chips = [
    { label: "Your logo", className: "-left-3 top-3", delay: "300ms" },
    { label: "Your prizes", className: "-right-4 top-16", delay: "1400ms" },
    { label: "Your colours", className: "left-1 bottom-1", delay: "2300ms" },
  ];
  return (
    <div className="relative mx-auto flex h-40 w-full max-w-xs items-center justify-center" aria-hidden>
      <span
        className="absolute size-24 rounded-full bg-emerald-400/30"
        style={{ animation: "ring-pulse 2.4s ease-out infinite" }}
      />
      <div className="relative flex h-32 w-20 items-center justify-center rounded-2xl border-4 border-zinc-900 bg-white shadow-xl">
        <Gamepad2
          className="size-12 text-emerald-600"
          style={{ animation: "float-slow 3s ease-in-out infinite" }}
        />
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

const STEP_VISUALS = [PickAGameVisual, MakeItYoursVisual, ShareLinkVisual];

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
            Branded games for your business
          </span>

          <h1
            className="animate-fade-up mt-6 flex items-center gap-3 text-5xl font-extrabold tracking-tight text-zinc-900 sm:text-7xl"
            style={{ animationDelay: "80ms" }}
          >
            <span
              className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg sm:size-16"
              style={{ animation: "float-slow 5s ease-in-out infinite" }}
            >
              <Gamepad2 className="size-7 sm:size-9" aria-hidden />
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
            Turn one-time shoppers into repeat buyers. Build a branded game —
            whack-a-mole, slice ninja or match three — share one link, and let
            your customers play their way up the leaderboard.
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

          {/* Animated sample of the catalogue */}
          <div
            className="animate-fade-up mt-10 grid w-full max-w-md grid-cols-3 gap-2"
            style={{ animationDelay: "320ms" }}
            aria-hidden
          >
            {DEMO_GAMES.map((game, i) => (
              <div
                key={game.label}
                className="card flex flex-col items-center gap-1.5 p-3"
                style={{
                  animation: `float-slow ${4.5 + (i % 3) * 0.6}s ease-in-out ${i * 250}ms infinite`,
                }}
              >
                <GameLoop
                  type={game.type}
                  icon={game.icon}
                  swatch={game.swatch}
                  className="size-9 rounded-xl"
                />
                <span className="text-[11px] font-semibold text-zinc-600">
                  {game.label}
                </span>
              </div>
            ))}
          </div>
          <p
            className="animate-fade-up mt-3 text-xs font-medium text-zinc-400"
            style={{ animationDelay: "400ms" }}
          >
            Three games, each one included on every plan.
          </p>
        </div>
        <SwipeHint />
      </Deck>

      {/* Card 2 — What a week actually looks like, start to finish */}
      <Deck id="story">
        <FlipCard className="flex justify-center">
          <div className="card relative w-full max-w-lg overflow-hidden p-8 text-center sm:p-10">
            <span
              aria-hidden
              className="pointer-events-none absolute -right-4 -top-12 select-none text-[11rem] font-black leading-none text-emerald-500/[0.06]"
            >
              7
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
              <CalendarDays className="size-3" aria-hidden />
              A week on Spendbox
            </span>

            <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">
              One link, one board,
              <br />
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                prizes on Monday
              </span>
            </h2>

            {/* The leaderboard the week is played for */}
            <ol className="mx-auto mt-7 flex max-w-xs flex-col gap-2" aria-hidden>
              {WEEK_BOARD.map((row, i) => (
                <li
                  key={row.name}
                  className={
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-left " +
                    (i === 0
                      ? "bg-gradient-to-r from-emerald-50 to-teal-50 ring-1 ring-emerald-200"
                      : "bg-zinc-50")
                  }
                  style={{
                    animation: `float-slow ${5 + i}s ease-in-out ${i * 350}ms infinite`,
                  }}
                >
                  <span className="w-5 shrink-0 text-center text-sm">
                    {row.medal}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium text-zinc-700">
                    {row.name}
                  </span>
                  <span className="font-mono text-sm font-bold text-zinc-900">
                    {row.score}
                  </span>
                </li>
              ))}
            </ol>

            <p className="mx-auto mt-7 max-w-md text-sm leading-relaxed text-zinc-600 sm:text-base">
              Put your link on receipts, on a counter QR, in your WhatsApp bio.
              Everyone who taps it gets three plays for the week and a place on
              your board. When the week closes, whoever finished on top gets a
              redemption code by email — and the board starts again from zero,
              which is the reason they come back.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Link2 className="size-3.5 text-emerald-600" aria-hidden />1
                shared link
              </span>
              <span className="flex items-center gap-1.5">
                <Star
                  className="size-3.5 fill-amber-400 text-amber-400"
                  aria-hidden
                />
                No app, no sign-up
              </span>
              <span className="flex items-center gap-1.5">
                <Trophy className="size-3.5 text-emerald-600" aria-hidden />
                Resets every week
              </span>
            </div>
          </div>
        </FlipCard>
        <SwipeHint />
      </Deck>

      {/* Cards 3–5 — How it works, one card per step */}
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
                    plays/yr
                  </span>
                </p>
                <p className="mt-2 text-sm text-zinc-600">
                  One live game with two prizes, branded to you — everyone who
                  taps your link on the same leaderboard. Every game included.
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
                    plays/yr
                  </span>
                </p>
                <p className="mt-2 text-sm text-zinc-600">
                  Unlimited live games, 10 prizes in each, and your own artwork
                  throughout. Top up any time — on any plan.
                </p>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-zinc-400">
              A play is one round a customer finishes. Need more? Buy top-up
              plays in a click — no upgrade required.
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
              <Gamepad2 className="size-8" aria-hidden />
            </div>
            <h2 className="mt-6 max-w-xl text-balance text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl">
              Ready to turn players into repeat customers?
            </h2>
            <p className="mt-4 max-w-md text-balance text-zinc-600">
              Your first game takes about two minutes — pick it, play it in the
              preview, share the link.
            </p>
            <Link href="/signup" className="btn-primary mt-8 text-base">
              Build your first game
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
