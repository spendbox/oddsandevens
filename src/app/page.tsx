import Link from "next/link";
import { ArrowRight, Heart, Lock } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LIVES_MAX, MIN_LENGTH } from "@/lib/constants";
import { PUBLIC_BOX_COLUMNS, toPublicBox, type BoxRow } from "@/lib/game/boxes";
import { formatNaira, minFundingKobo, rewardLabel, splitFunding } from "@/lib/game/rewards";
import { DifficultyBadge } from "@/components/difficulty-badge";
import { PlayerProvider } from "@/components/player/player-context";
import { SiteHeader } from "@/components/site-header";
import { BoxCard } from "@/components/box-card";
import type { PublicBox } from "@/lib/types";

const RECENT_UNLOCKS = 6;

/**
 * Rendered per request rather than prerendered.
 *
 * Nothing on this page touches a request-time API, so Next would happily
 * build it once and serve that forever — which would mean a box funded this
 * morning never appearing, and a safe cracked an hour ago still advertising a
 * prize that has already been paid out. The lobby is a live board.
 */
export const dynamic = "force-dynamic";

/** The lobby: the free public box, then every box anyone has funded. */
export default async function Home() {
  const db = supabaseAdmin();

  const [{ data: live }, { data: cracked }] = await Promise.all([
    db
      .from("boxes")
      .select(PUBLIC_BOX_COLUMNS)
      .eq("status", "live")
      .order("reward_kobo", { ascending: false }),
    db
      .from("boxes")
      .select(PUBLIC_BOX_COLUMNS)
      .eq("status", "unlocked")
      .order("unlocked_at", { ascending: false })
      .limit(RECENT_UNLOCKS),
  ]);

  const rows = [...((live ?? []) as BoxRow[]), ...((cracked ?? []) as BoxRow[])];
  const names = await contributorNames(db, rows);
  const winners = await winnerEmails(db, rows);
  const decorate = (row: BoxRow): PublicBox =>
    toPublicBox(row, {
      contributor: row.contributor_id ? (names.get(row.contributor_id) ?? null) : null,
      winnerEmail: row.unlocked_by ? (winners.get(row.unlocked_by) ?? null) : null,
    });

  const liveBoxes = ((live ?? []) as BoxRow[]).map(decorate);
  const featured = liveBoxes.find((box) => box.kind === "general") ?? null;
  const staked = liveBoxes.filter((box) => box.kind === "contributor");
  const opened = ((cracked ?? []) as BoxRow[]).map(decorate);

  return (
    <PlayerProvider>
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 pb-10 pt-10 sm:pt-16">
          <div className="animate-fade-up mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
              Guess the password.
              <br />
              <span className="brass-text">Open the safe.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-zinc-400">
              Every spendbox is a password with real money behind it. You
              don&apos;t get told how long it is. Every guess costs a life and
              answers three things — too short, too long or right; how many
              characters landed exactly; how many were right but the wrong case.
            </p>
            <p className="mt-3 text-sm text-zinc-500">
              Playing is free. You hold {LIVES_MAX} lives and one comes back every
              hour, so a hard box is a long siege rather than a quick go.
            </p>
          </div>

          {featured && (
            <div className="animate-fade-up panel mx-auto mt-10 max-w-2xl rounded-3xl p-6 text-center sm:p-8">
              <p className="text-xs uppercase tracking-widest text-zinc-500">
                The public box — free, on us
              </p>
              <h2 className="mt-2 text-xl font-bold sm:text-2xl">{featured.title}</h2>
              {featured.blurb && (
                <p className="mt-1 text-sm text-zinc-400">{featured.blurb}</p>
              )}
              <p
                className={
                  "mt-4 font-black tabular-nums " +
                  (featured.isChallenge
                    ? "text-3xl text-zinc-300"
                    : "brass-text text-5xl sm:text-6xl")
                }
              >
                {rewardLabel(featured.rewardKobo)}
              </p>
              <div className="mt-3 flex justify-center">
                <DifficultyBadge box={featured} />
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                {featured.playersCount} hunters · {featured.attemptsCount} attempts so
                far
              </p>
              <Link
                href={`/b/${featured.slug}`}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brass px-6 py-3 font-bold text-zinc-950 transition hover:bg-brass-bright"
              >
                Take a crack at it
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
          )}
        </section>

        {staked.length > 0 && (
          <section className="mx-auto w-full max-w-5xl px-4 pb-12">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Put up by contributors
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {staked.map((box, i) => (
                <BoxCard key={box.slug} box={box} index={i} />
              ))}
            </div>
          </section>
        )}

        {opened.length > 0 && (
          <section className="mx-auto w-full max-w-5xl px-4 pb-12">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Already opened
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {opened.map((box, i) => (
                <BoxCard key={box.slug} box={box} index={i} />
              ))}
            </div>
          </section>
        )}

        <HowItWorks />
      </main>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-600">
        <Link href="/dashboard" className="hover:text-zinc-400">
          Contributor dashboard
        </Link>
        <span className="mx-2">·</span>
        <Link href="/me" className="hover:text-zinc-400">
          Your lives and rewards
        </Link>
      </footer>
    </PlayerProvider>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: Lock,
      title: "Guess blind",
      body: "Letters, digits and symbols, and case matters. Nothing tells you how long the password is — every guess answers only whether it's too short, too long or right, plus how many characters landed exactly and how many were right but the wrong case.",
    },
    {
      icon: Heart,
      title: "One life, one guess",
      body: `Every attempt costs a life, win or lose. You hold ${LIVES_MAX}, shared across every box, and one refills every hour — twenty-four a day, free, forever. Buying more only buys you speed.`,
    },
    {
      icon: ArrowRight,
      title: "Or put one up",
      body: `Anyone can. A three-character password starts at ${formatNaira(
        minFundingKobo(MIN_LENGTH)
      )} to fund; longer ones cost more, because they take longer to crack. 70% becomes the reward — ${formatNaira(
        splitFunding(minFundingKobo(MIN_LENGTH)).rewardKobo
      )} at the floor — and you earn 70% of every power-up bought attacking it.`,
    },
  ];

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-16">
      <div className="grid gap-3 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, body }, i) => (
          <div
            key={title}
            style={{ ["--i" as string]: i }}
            className="panel animate-fade-up stagger rounded-2xl p-5"
          >
            <Icon className="size-5 text-brass" aria-hidden />
            <h3 className="mt-3 font-semibold">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{body}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 text-center">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold transition hover:border-brass/40"
        >
          Build a spendbox
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

type Db = ReturnType<typeof supabaseAdmin>;

async function contributorNames(db: Db, rows: BoxRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.contributor_id).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const { data } = await db.from("contributors").select("id, display_name").in("id", ids);
  return new Map(
    ((data ?? []) as { id: string; display_name: string }[]).map((c) => [c.id, c.display_name])
  );
}

async function winnerEmails(db: Db, rows: BoxRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.unlocked_by).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const { data } = await db.from("players").select("id, email").in("id", ids);
  return new Map(((data ?? []) as { id: string; email: string }[]).map((p) => [p.id, p.email]));
}
