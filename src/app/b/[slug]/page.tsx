import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { buildPlayView, findBox } from "@/lib/game/view";
import { rewardLabel } from "@/lib/game/rewards";
import { difficultyOf, estimateAttempts, roughly } from "@/lib/game/difficulty";
import { PlayerProvider } from "@/components/player/player-context";
import { SiteHeader } from "@/components/site-header";
import { PlaySurface } from "@/components/safe/play-surface";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const box = await findBox(supabaseAdmin(), slug);
  if (!box) return { title: "Spendbox" };
  // Note what the description doesn't say: how long the password is. A share
  // card is the most-read text on the site and would give away the first thing
  // a player has to work out.
  return {
    title: `${box.title} — ${rewardLabel(box.reward_kobo)} behind a password`,
    description:
      box.blurb ??
      `${difficultyOf(box.length)}. Around ${roughly(estimateAttempts(box.length))} attempts to crack. Guess the password and it's yours.`,
  };
}

/**
 * A box, server-rendered with the run already in it.
 *
 * Doing the first read here rather than in the client means a shared link
 * opens on a board rather than a spinner — which matters, because a shared
 * link is how almost everyone arrives.
 */
export default async function BoxPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ reference?: string }>;
}) {
  const [{ slug }, { reference }] = await Promise.all([params, searchParams]);

  const db = supabaseAdmin();
  const box = await findBox(db, slug);
  if (!box || box.status === "draft" || box.status === "funding") notFound();

  const view = await buildPlayView(db, box, await playerEmail());

  return (
    <PlayerProvider>
      <SiteHeader />
      <main className="flex-1">
        <PlaySurface initial={view} slug={box.slug} pendingReference={reference ?? null} />
      </main>
    </PlayerProvider>
  );
}
