import Link from "next/link";
import { ArrowRight, Sparkles, Trophy } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LIVES_MAX, MIN_LENGTH } from "@/lib/constants";
import { PUBLIC_BOX_COLUMNS, toPublicBox, type BoxRow } from "@/lib/game/boxes";
import { formatNaira, minFundingKobo, rewardLabel } from "@/lib/game/rewards";
import { DifficultyBadge } from "@/components/difficulty-badge";
import { plural } from "@/lib/plural";
import { PlayerProvider } from "@/components/player/player-context";
import { SiteHeader } from "@/components/site-header";
import { BoxCard } from "@/components/box-card";
import { HowItWorksButton } from "@/components/how-it-works";
import { SafeArt } from "@/components/safe/safe-art";
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
        {/*
          The hero. One sentence of what this is, one line of what it costs, and
          the safe itself doing something — everything else that used to be up
          here is a tap away in the explainer instead. The board is what people
          came for and it should start within a screen of the top.
        */}
        <section className="relative mx-auto w-full max-w-5xl overflow-hidden px-4 pb-10 pt-10 sm:pt-14">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 -z-10 size-[34rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brass/10 blur-3xl"
          />

          <div className="animate-fade-up mx-auto max-w-2xl text-center">
            <SafeArt design="brass" className="mx-auto size-24 sm:size-32" />
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
              Guess the password.
              <br />
              <span className="brass-text">Open the safe.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-zinc-400">
              Every Spendbox protects real money behind a unique password.
              Playing is free: you start with {LIVES_MAX} lives and regain 1 life
              every hour. With each guess, you&apos;ll receive a single score
              from 0 to 100, showing exactly how close you are to cracking the
              code.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {featured && (
                <Link
                  href={`/b/${featured.slug}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-brass px-6 py-3 font-bold text-zinc-950 transition hover:bg-brass-bright"
                >
                  Take a crack at it
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
              <HowItWorksButton />
            </div>
          </div>

          {featured && (
            <Link
              href={`/b/${featured.slug}`}
              className="animate-fade-up panel group mx-auto mt-10 flex max-w-2xl flex-col items-center gap-4 rounded-3xl p-6 text-center transition hover:border-brass/40 sm:flex-row sm:p-8 sm:text-left"
            >
              <SafeArt
                design={featured.design}
                className="size-24 shrink-0 transition group-hover:scale-105 sm:size-28"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-widest text-brass sm:justify-start">
                  <Sparkles className="size-3.5" aria-hidden />
                  Open to everyone
                </p>
                <h2 className="mt-1 text-xl font-bold sm:text-2xl">{featured.title}</h2>
                {featured.blurb && (
                  <p className="mt-1 text-sm text-zinc-400">{featured.blurb}</p>
                )}
                <p
                  className={
                    "mt-3 font-black tabular-nums " +
                    (featured.isChallenge
                      ? "text-2xl text-zinc-300"
                      : "brass-text text-4xl sm:text-5xl")
                  }
                >
                  {rewardLabel(featured.rewardKobo)}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:justify-start">
                  <DifficultyBadge difficulty={featured.difficulty} />
                  <span className="text-sm text-zinc-500">
                    {plural(featured.playersCount, "hunter")} ·{" "}
                    {plural(featured.attemptsCount, "attempt")} so far
                  </span>
                </div>
              </div>
            </Link>
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
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              <Trophy className="size-4 text-brass" aria-hidden />
              Already opened
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {opened.map((box, i) => (
                <BoxCard key={box.slug} box={box} index={i} />
              ))}
            </div>
          </section>
        )}

        <PutOneUp />
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

/**
 * The other half of the site, which the lobby otherwise never mentions.
 *
 * The three explainer cards that used to sit here are in a dialog now — they
 * were the most important text on the page and the least read, because
 * everybody had already scrolled to the boxes. What's left is the one thing a
 * visitor genuinely can't discover by clicking a safe: that they can put one
 * up themselves, and roughly what that costs.
 */
function PutOneUp() {
  const floor = minFundingKobo(MIN_LENGTH);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-16">
      <div className="panel animate-fade-up flex flex-col items-center gap-6 rounded-3xl p-6 sm:flex-row sm:p-8">
        <div className="flex shrink-0 gap-2">
          <SafeArt design="emerald" className="size-16 sm:size-20" />
          <SafeArt design="midnight" className="size-16 sm:size-20" />
          <SafeArt design="crimson" className="hidden size-16 sm:block sm:size-20" />
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 className="text-xl font-bold sm:text-2xl">Build your own Spendbox</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Anyone can create a Spendbox — no application, no approval process.
            Just choose a name, set a password, and decide on a reward.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Fund your Spendbox with as little as {formatNaira(floor)} and publish
            it for the world to challenge. You keep 70% of everything hunters
            spend attempting to crack it, while the person who successfully
            unlocks it wins the reward inside.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-brass px-5 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-brass-bright"
            >
              Build a spendbox
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <HowItWorksButton
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold transition hover:border-brass/40"
              label="Read the rules first"
            />
          </div>
        </div>
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
