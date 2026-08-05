import { notFound } from "next/navigation";
import { currentPlayerState } from "@/lib/player-state";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { buildPlayView, findBox } from "@/lib/game/view";
import { rewardLabel } from "@/lib/game/rewards";
import { difficultyOf } from "@/lib/game/difficulty";
import { PlayerProvider } from "@/components/player/player-context";
import { PlaySurface } from "@/components/safe/play-surface";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const box = await findBox(supabaseAdmin(), slug);
  if (!box) return { title: "Spendbox" };
  // Note what the description doesn't say: how long the password is, or any
  // number derived from it. A share card is the most-read text on the site,
  // and an attempt estimate is a deterministic function of the length — it
  // would have handed over the first thing a player has to work out.
  return {
    title: `${box.title} — ${rewardLabel(box.reward_kobo)} behind a password`,
    description:
      box.blurb ??
      `${difficultyOf(box.length)}. Guess the password and it's yours.`,
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
    <PlayerProvider initial={await currentPlayerState()}>
      {/*
        No site header on this one, and that is the point. The scene is the
        whole surface — sky to floor, edge to edge — and a chrome bar across
        the top of it would put the game back in a box. What the header carried
        is carried by the scene's own rail instead: the way out, the life pool,
        and the help.
      */}
      {/*
        `100dvh` rather than `flex-1`, and that is the whole fix for the dead
        strip under the dock on a phone.

        The body is `min-h-full` against an `h-full` html, and on iOS Safari
        that resolves to the *small* viewport — the screen as it is with the
        browser's own toolbars showing. So the scene was built to that height
        once, and the moment the address bar slid away the visible viewport
        grew by fifty-odd pixels that the scene did not: the buttons stayed put
        and a band of background appeared under them. The dynamic viewport unit
        is the one that tracks the chrome as it comes and goes, so the surface
        is always exactly as tall as what you can see and the dock sits on the
        bottom edge of it either way.
      */}
      <main className="relative flex h-viewport flex-col overflow-hidden">
        <PlaySurface initial={view} slug={box.slug} pendingReference={reference ?? null} />
      </main>
    </PlayerProvider>
  );
}
