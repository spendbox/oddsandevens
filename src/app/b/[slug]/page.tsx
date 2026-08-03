import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { buildPlayView, findBox } from "@/lib/game/view";
import { formatNaira } from "@/lib/game/stakes";
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
  return {
    title: `${box.title} — ${formatNaira(box.prize_kobo)} behind a password`,
    description:
      box.blurb ??
      `Guess the ${box.length}-character password and the ${formatNaira(box.prize_kobo)} is yours.`,
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
